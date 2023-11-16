import { HttpApi, HttpMethod } from '@aws-cdk/aws-apigatewayv2-alpha'
import {
  HttpUrlIntegration,
  HttpLambdaIntegration,
} from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Duration, Stack, RemovalPolicy, type StackProps } from 'aws-cdk-lib'
import * as awsCloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as awsCloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as awsIam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment'
import type { Construct } from 'constructs'

export class SvelteKitStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props)

    /**
     * Create an S3 bucket to hold the built static website's assets.
     */
    const websiteBucket = new s3.Bucket(this, `${id}-bucket`, {
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    })

    /**
     * Allow CloudFront (CDN) to access the S3 bucket.
     *
     * TODO: migrate from OAI to OAC because it's legacy ??
     *
     * @see https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html
     */
    const cloudfrontOriginAccessIdentity = new awsCloudfront.OriginAccessIdentity(
      this,
      `${id}-cloudfront-OAI`,
    )

    /**
     * Policy statement for the S3 bucket, allowing CloudFront to access the bucket.
     */
    const policyStatement = new awsIam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [websiteBucket.arnForObjects('*')],
      principals: [
        new awsIam.CanonicalUserPrincipal(
          cloudfrontOriginAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId,
        ),
      ],
    })

    websiteBucket.addToResourcePolicy(policyStatement)

    /**
     * A CloudFront origin indicates a location where the CDN can direct requests to.
     * For a static website, direct all requests to the S3 bucket.
     */
    const s3Origin = new awsCloudfrontOrigins.S3Origin(websiteBucket, {
      originAccessIdentity: cloudfrontOriginAccessIdentity,
    })

    const distribution = new awsCloudfront.Distribution(this, `${id}-cloudfront-distribution`, {
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: s3Origin,
        allowedMethods: awsCloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    })

    new s3Deployment.BucketDeployment(this, `${id}-bucket-deployment`, {
      sources: [s3Deployment.Source.asset('./build/s3')],
      destinationBucket: websiteBucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    })

    const handler = new lambda.Function(this, `${id}-lambda`, {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromAsset('./build/lambda'),
      handler: 'index.handler',
      timeout: Duration.seconds(5),
      memorySize: 256,
    })

    const lambdaIntegration = new HttpLambdaIntegration(`${id}-lambda-integration`, handler)

    const httpApi = new HttpApi(this, `${id}-api`, {
      createDefaultStage: true,
      defaultIntegration: lambdaIntegration,
    })

    const cloudFrontIntegration = new HttpUrlIntegration(
      `${id}-cloudfront-integration`,
      `https://${distribution.distributionDomainName}/_app/{proxy}`,
    )

    httpApi.addRoutes({
      path: '/_app/{proxy+}',
      methods: [HttpMethod.GET, HttpMethod.HEAD],
      integration: cloudFrontIntegration,
    })
  }
}
