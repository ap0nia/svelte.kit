import path from 'node:path'

import { HttpApi } from '@aws-cdk/aws-apigatewayv2-alpha'
import {
  HttpLambdaIntegration,
  type HttpLambdaIntegrationProps,
} from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib'
import * as awsCloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as awsCloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as awsIam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'

import { findStaticFiles as findStaticFiles, loadSvelteKitConfig } from './config'

// import { loadSvelteKitConfig } from './config'

/**
 * Configure the deployed infrastructure.
 */
export type SvelteKitOptions = {
  /**
   * The directory to build the SvelteKit application to.
   *
   * @default 'build'
   */
  out?: string

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
  lambdaAtEdgeDirectory?: string

  /**
   * The name of the Lambda function handler.
   *
   * @default 'index.handler'
   */
  lambdaHandler?: string

  /**
   * Directly customize/override props provided to the constructs.
   */
  constructProps?: SvelteKitConstructProps
}

/**
 * Props for all the allocated constructs.
 */
export type SvelteKitConstructProps = {
  bucket?: (scope: SvelteKit) => Partial<s3.BucketProps>
  originAccessIdentity?: (scope: SvelteKit) => Partial<awsCloudfront.OriginAccessIdentityProps>
  policyStatement?: (scope: SvelteKit) => Partial<awsIam.PolicyStatementProps>
  handler?: (scope: SvelteKit) => Partial<lambda.FunctionProps>
  lambdaIntegration?: (scope: SvelteKit) => Partial<HttpLambdaIntegrationProps>
  httpApi?: (scope: SvelteKit) => Partial<HttpApi>
  s3Origin?: (scope: SvelteKit) => Partial<awsCloudfrontOrigins.S3OriginProps>
  apiOrigin?: (scope: SvelteKit) => Partial<awsCloudfrontOrigins.HttpOriginProps>
  cachePolicy?: (scope: SvelteKit) => Partial<awsCloudfront.CachePolicyProps>
  distribution?: (scope: SvelteKit) => Partial<awsCloudfront.DistributionProps>
  bucketDeployment?: (scope: SvelteKit) => Partial<s3Deployment.BucketDeploymentProps>

  /**
   * Props that are provided to all CloudFront behaviors for static assets from S3.
   */
  staticBehaviour?: (scope: SvelteKit) => awsCloudfront.BehaviorOptions
}

/**
 * AWS CDK construct for deploying built SvelteKit applications.
 */
export class SvelteKit extends Construct {
  /**
   * The S3 bucket that holds the built static website's assets.
   */
  bucket: s3.Bucket

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
  handler: lambda.Function

  /**
   * The Lambda integration for the API.
   */
  lambdaIntegration: HttpLambdaIntegration

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
  apiOrigin: awsCloudfrontOrigins.HttpOrigin

  /**
   * Custom cache policy for the Lambda function.
   */
  lambdaCachePolicy: awsCloudfront.CachePolicy

  /**
   * The CloudFront function that handles requests to the API.
   */
  edgeFunction: awsCloudfront.Function

  /**
   * The CloudFront distribution that serves the website.
   */
  distribution: awsCloudfront.Distribution

  /**
   * The S3 bucket deployment that uploads the built static website's assets to S3.
   */
  bucketDeployment: s3Deployment.BucketDeployment

  /**
   * The configured options used to deploy the infrastructure.
   */
  options: Required<SvelteKitOptions>

  constructor(scope: Construct, id: string, options: SvelteKitOptions = {}) {
    super(scope, id)

    this.options = {
      out: options.out ?? 'build',
      s3Directory: options.s3Directory ?? 's3',
      lambdaDirectory: options.lambdaDirectory ?? 'lambda',
      lambdaAtEdgeDirectory: options.lambdaAtEdgeDirectory ?? 'lambda@edge',
      lambdaHandler: options.lambdaHandler ?? 'index.handler',
      constructProps: options.constructProps ?? {},
    }

    // TODO: successfully read the SvelteKit config file
    // const svelteKitConfig = loadSvelteKitConfig()

    const s3Directory = path.join(this.options.out, this.options.s3Directory)
    const lambdaDirectory = path.join(this.options.out, this.options.lambdaDirectory)
    const lambdaAtEdgeDirectory = path.join(this.options.out, this.options.lambdaAtEdgeDirectory)

    this.bucket = new s3.Bucket(this, 'bucket', {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      ...this.options.constructProps.bucket?.(this),
    })

    this.originAccessIdentity = new awsCloudfront.OriginAccessIdentity(
      this,
      'cloudfront-OAI',
      this.options.constructProps.originAccessIdentity?.(this),
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

    this.handler = new lambda.Function(this, 'lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset(lambdaDirectory),
      handler: this.options.lambdaHandler,
      timeout: Duration.seconds(15),
      memorySize: 1024,
      ...this.options.constructProps.handler?.(this),
    })

    this.lambdaIntegration = new HttpLambdaIntegration(
      'lambda-integration',
      this.handler,
      this.options.constructProps.lambdaIntegration?.(this),
    )

    this.httpApi = new HttpApi(this, 'api', {
      createDefaultStage: true,
      defaultIntegration: this.lambdaIntegration,
      ...this.options.constructProps.httpApi?.(this),
    })

    this.s3Origin = new awsCloudfrontOrigins.S3Origin(this.bucket, {
      originAccessIdentity: this.originAccessIdentity,
      ...this.options.constructProps.s3Origin?.(this),
    })

    this.apiOrigin = new awsCloudfrontOrigins.HttpOrigin(
      Fn.select(2, Fn.split('/', this.httpApi.url ?? '')),
      this.options.constructProps.apiOrigin?.(this),
    )

    this.lambdaCachePolicy = new awsCloudfront.CachePolicy(this, 'cache-policy', {
      headerBehavior: awsCloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: awsCloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: awsCloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(31536000),
      defaultTtl: Duration.seconds(0),
      ...this.options.constructProps.cachePolicy?.(this),
    })

    this.edgeFunction = new awsCloudfront.Function(this, 'edge-function', {
      code: awsCloudfront.FunctionCode.fromFile({
        filePath: path.join(lambdaAtEdgeDirectory, 'index.js'),
      }),
    })

    this.distribution = new awsCloudfront.Distribution(this, 'cloudfront-distribution', {
      defaultBehavior: {
        origin: this.apiOrigin,
        viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: awsCloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: awsCloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: this.lambdaCachePolicy,
        originRequestPolicy: awsCloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [
          {
            function: this.edgeFunction,
            eventType: awsCloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      ...this.options.constructProps.distribution?.(this),
    })

    const staticBehaviourProps = this.options.constructProps.staticBehaviour?.(this)

    this.distribution.addBehavior('_app/*', this.s3Origin, {
      allowedMethods: awsCloudfront.AllowedMethods.ALLOW_ALL,
      cachedMethods: awsCloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
      cachePolicy: awsCloudfront.CachePolicy.CACHING_OPTIMIZED,
      originRequestPolicy: awsCloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      ...staticBehaviourProps,
    })

    this.bucketDeployment = new s3Deployment.BucketDeployment(this, 'bucket-deployment', {
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
  }

  /**
   * TODO: document this.
   */
  async init() {
    const config = await loadSvelteKitConfig()
    console.log('config loaded: ', config)
  }
}
