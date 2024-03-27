import path from 'node:path'

import { HttpApi } from '@aws-cdk/aws-apigatewayv2-alpha'
import {
  HttpLambdaIntegration,
  type HttpLambdaIntegrationProps,
} from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import type { Config } from '@sveltejs/kit'
import { CfnOutput, Duration, Fn, RemovalPolicy } from 'aws-cdk-lib'
import * as awsCloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as awsCloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as awsIam from 'aws-cdk-lib/aws-iam'
import * as awsLambda from 'aws-cdk-lib/aws-lambda'
import * as awsS3 from 'aws-cdk-lib/aws-s3'
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'

import { findStaticFiles as findStaticFiles, loadSvelteKitConfig } from './config'

/**
 * Configure the deployed infrastructure.
 */
export type SvelteKitOptions = {
  /**
   * The directory to write the build outputs to.
   *
   * @default 'build'
   */
  out?: string

  /**
   * @default 'prerendered'
   */
  prerenderedDirectory?: string

  /**
   * Subdirectory in the build directory to serve static assets from S3 to CloudFront.
   *
   * @default 's3'
   */
  s3Directory?: string

  /**
   * Subdirectory in the build directory to serve lambda files.
   *
   * @default 'lambda'
   */
  lambdaDirectory?: string

  /**
   * Subdirectory in the build directory to serve CloudFront (function) files.
   *
   * @default 'lambda@edge'
   */
  cloudfrontDirectory?: string

  /**
   * The name of the Lambda function handler.
   *
   * @default 'index.handler'
   */
  lambdaHandler?: string

  /**
   * Whether to enable AWS Lambda streaming.
   *
   * @see https://aws.amazon.com/blogs/compute/introducing-aws-lambda-response-streaming
   */
  stream?: boolean

  /**
   * @default ''
   */
  domainName?: string

  /**
   * Directly customize/override props provided to the constructs.
   */
  constructProps?: SvelteKitConstructProps
}

/**
 * Props for all the allocated constructs.
 */
export type SvelteKitConstructProps = {
  bucket?: FunctionOrValue<(scope: SvelteKit) => Partial<awsS3.BucketProps> | Nullish>

  originAccessIdentity?: FunctionOrValue<
    (scope: SvelteKit) => Partial<awsCloudfront.OriginAccessIdentityProps> | Nullish
  >

  policyStatement?: (scope: SvelteKit) => Partial<awsIam.PolicyStatementProps> | Nullish

  handler?: FunctionOrValue<(scope: SvelteKit) => Partial<awsLambda.FunctionProps> | Nullish>

  lambdaIntegration?: FunctionOrValue<
    (scope: SvelteKit) => Partial<HttpLambdaIntegrationProps> | Nullish
  >

  httpApi?: FunctionOrValue<(scope: SvelteKit) => Partial<HttpApi> | Nullish>

  s3Origin?: FunctionOrValue<
    (scope: SvelteKit) => Partial<awsCloudfrontOrigins.S3OriginProps> | Nullish
  >

  apiOrigin?: FunctionOrValue<
    (scope: SvelteKit) => Partial<awsCloudfrontOrigins.HttpOriginProps> | Nullish
  >

  cachePolicy?: FunctionOrValue<
    (scope: SvelteKit) => Partial<awsCloudfront.CachePolicyProps> | Nullish
  >

  distribution?: FunctionOrValue<
    (scope: SvelteKit) => Partial<awsCloudfront.DistributionProps> | Nullish
  >

  bucketDeployment?: FunctionOrValue<
    (scope: SvelteKit) => Partial<s3Deployment.BucketDeploymentProps> | Nullish
  >

  /**
   * Props that are provided to all CloudFront behaviors for static assets from S3.
   */
  staticBehaviour?: FunctionOrValue<(scope: SvelteKit) => awsCloudfront.BehaviorOptions | Nullish>
}

/**
 */
export type SvelteKitOutputs = {
  cloudfrontUrl: CfnOutput
}

const defaultOptions: Required<SvelteKitOptions> = {
  domainName: '',
  prerenderedDirectory: 'prerendered',
  lambdaHandler: 'index.handler',
  cloudfrontDirectory: 'cloudfront',
  stream: false,
  out: 'build',
  s3Directory: 's3',
  lambdaDirectory: 'lambda',
  constructProps: {},
}

const placeholder = Object.create(null)

/**
 * AWS CDK construct for deploying built SvelteKit applications.
 */
export class SvelteKit extends Construct {
  /**
   * The S3 bucket that holds the built static website's assets.
   */
  bucket: awsS3.Bucket

  /**
   * The CloudFront origin access identity for the S3 bucket
   * that allows the CloudFront Distribution to acess the S3 bucket's contents.
   *
   * TODO: migrate from OAI to OAC because it's legacy ??
   *
   * @see https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
   */
  originAccessIdentity: awsCloudfront.OriginAccessIdentity

  /**
   * Policy statement for the S3 bucket, allowing CloudFront to access the bucket.
   */
  policyStatement: awsIam.PolicyStatement

  /**
   * The Lambda function that handles requests to the API.
   */
  handler: awsLambda.Function

  /**
   * The Lambda integration for the API.
   */
  lambdaIntegration: HttpLambdaIntegration

  /**
   */
  lambdaFunctionUrl: awsLambda.FunctionUrl

  /**
   * The API Gateway HTTP API.
   */
  httpApi: HttpApi

  /**
   * CloudFront origin for the S3 bucket.
   * The CDN should try to redirect requests for static assets here if possible.
   */
  s3Origin: awsCloudfrontOrigins.S3Origin

  /**
   * CloudFront origin for the API.
   * The CDN should try to redirect requests for SSR/API here if possible.
   */
  lambdaOrigin: awsCloudfrontOrigins.HttpOrigin

  /**
   * The CloudFront distribution that serves the website.
   */
  distribution: awsCloudfront.Distribution

  /**
   * The S3 bucket deployment that uploads the built static website's assets to S3.
   */
  bucketDeployment: s3Deployment.BucketDeployment

  /**
   */
  cloudfrontFunction: awsCloudfront.Function

  /**
   */
  outputs: SvelteKitOutputs

  /**
   * The configured options used to deploy the infrastructure.
   */
  options: Required<SvelteKitOptions>

  /**
   */
  sveltekitConfig: Config

  constructor(scope: Construct, id: string, options?: SvelteKitOptions) {
    super(scope, id)
    this.options = { ...defaultOptions, ...options }
    this.sveltekitConfig = {}
    this.bucket = placeholder
    this.originAccessIdentity = placeholder
    this.policyStatement = placeholder
    this.handler = placeholder
    this.lambdaIntegration = placeholder
    this.lambdaFunctionUrl = placeholder
    this.httpApi = placeholder
    this.s3Origin = placeholder
    this.lambdaOrigin = placeholder
    this.distribution = placeholder
    this.bucketDeployment = placeholder
    this.cloudfrontFunction = placeholder
    this.outputs = placeholder
  }

  /**
   */
  async initialize(options?: SvelteKitOptions): Promise<void> {
    this.sveltekitConfig = await loadSvelteKitConfig()

    console.log('config loaded: ', this.sveltekitConfig)

    const adapter = this.sveltekitConfig.kit?.adapter

    const adapterOptions = adapter?.name === 'adapter-aws' ? adapter : undefined

    this.options = {
      ...this.options,
      ...adapterOptions,
      ...options,
    }

    const s3Directory = path.join(this.options.out, this.options.s3Directory)

    const lambdaDirectory = path.join(this.options.out, this.options.lambdaDirectory)

    const cloudfrontDirectory = path.join(this.options.out, this.options.cloudfrontDirectory)

    this.bucket = new awsS3.Bucket(this, 'Bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      ...invokeFunctionOrValue(this.options.constructProps.bucket, this),
    })

    this.originAccessIdentity = new awsCloudfront.OriginAccessIdentity(
      this,
      'CloudFront OAI',
      invokeFunctionOrValue(this.options.constructProps.originAccessIdentity, this),
    )

    this.policyStatement = new awsIam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [this.bucket.arnForObjects('*')],
      principals: [
        new awsIam.CanonicalUserPrincipal(
          this.originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId,
        ),
      ],
      ...this.options.constructProps.policyStatement?.(this),
    })

    this.bucket.addToResourcePolicy(this.policyStatement)

    this.handler = new awsLambda.Function(this, 'Lambda', {
      runtime: awsLambda.Runtime.NODEJS_18_X,
      code: awsLambda.Code.fromAsset(lambdaDirectory),
      handler: this.options.lambdaHandler,
      timeout: Duration.seconds(15),
      memorySize: 1024,
      ...invokeFunctionOrValue(this.options.constructProps.handler, this),
    })

    this.lambdaIntegration = new HttpLambdaIntegration(
      'Lambda Integration',
      this.handler,
      invokeFunctionOrValue(this.options.constructProps.lambdaIntegration, this),
    )

    this.lambdaFunctionUrl = this.handler.addFunctionUrl({
      authType: awsLambda.FunctionUrlAuthType.NONE,
      invokeMode: this.options.stream ? awsLambda.InvokeMode.RESPONSE_STREAM : undefined,
    })

    this.httpApi = new HttpApi(this, 'HTTP API', {
      createDefaultStage: true,
      defaultIntegration: this.lambdaIntegration,
      ...invokeFunctionOrValue(this.options.constructProps.httpApi, this),
    })

    this.s3Origin = new awsCloudfrontOrigins.S3Origin(this.bucket, {
      originAccessIdentity: this.originAccessIdentity,
      ...invokeFunctionOrValue(this.options.constructProps.s3Origin, this),
    })

    this.lambdaOrigin = new awsCloudfrontOrigins.HttpOrigin(
      Fn.select(2, Fn.split('/', this.lambdaFunctionUrl.url)),
      invokeFunctionOrValue(this.options.constructProps.apiOrigin, this),
    )

    this.cloudfrontFunction = new awsCloudfront.Function(this, 'CloudFront Function', {
      code: awsCloudfront.FunctionCode.fromFile({
        filePath: path.join(cloudfrontDirectory, 'index.js'),
      }),
    })

    const staticBehaviourProps = invokeFunctionOrValue(
      this.options.constructProps.staticBehaviour,
      this,
    )

    this.distribution = new awsCloudfront.Distribution(this, 'CloudFront Distribution', {
      defaultBehavior: {
        origin: this.lambdaOrigin,
        allowedMethods: awsCloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: awsCloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: awsCloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: this.cloudfrontFunction,
            eventType: awsCloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      ...invokeFunctionOrValue(this.options.constructProps.distribution, this),
      additionalBehaviors: {
        ['_app/*']: {
          origin: this.s3Origin,
          allowedMethods: awsCloudfront.AllowedMethods.ALLOW_ALL,
          cachedMethods: awsCloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
          cachePolicy: awsCloudfront.CachePolicy.CACHING_OPTIMIZED,
          originRequestPolicy: awsCloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          ...staticBehaviourProps,
        },
      },
    })

    this.bucketDeployment = new s3Deployment.BucketDeployment(this, 'Bucket Deployment', {
      sources: [s3Deployment.Source.asset(s3Directory)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      ...staticBehaviourProps,
    })

    findStaticFiles().forEach((file) => {
      const pattern = file.isDirectory ? `${file.path}/*` : file.path

      this.distribution.addBehavior(pattern, this.s3Origin, {
        allowedMethods: awsCloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: awsCloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: awsCloudfront.CachePolicy.CACHING_OPTIMIZED,
        viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        ...staticBehaviourProps,
      })
    })

    this.outputs = {
      cloudfrontUrl: new CfnOutput(this, 'CloudFront URL', {
        description: 'CloudFront URL',
        value: `https://${this.distribution.distributionDomainName}`,
      }),
    }
  }
}

export type Nullish = null | undefined | void

export type FunctionOrValue<T extends (...args: any) => any> = T | ReturnType<T>

export function invokeFunctionOrValue<T extends (...args: any) => any>(
  fn?: FunctionOrValue<T> | Nullish,
  ...args: Parameters<T>
): ReturnType<T> {
  if (isFunction(fn)) {
    fn(Array.isArray(args) ? args : args)
  }
  return isFunction(fn) ? fn(...(args as any)) : fn
}

export function isFunction(value: unknown): value is (...args: any) => any {
  return typeof value === 'function'
}
