import { HttpApi } from '@aws-cdk/aws-apigatewayv2-alpha'
import { HttpLambdaIntegration } from '@aws-cdk/aws-apigatewayv2-integrations-alpha'
import { Duration, Fn, RemovalPolicy } from 'aws-cdk-lib'
import * as awsCloudfront from 'aws-cdk-lib/aws-cloudfront'
import * as awsCloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins'
import * as awsIam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as s3 from 'aws-cdk-lib/aws-s3'
import * as s3Deployment from 'aws-cdk-lib/aws-s3-deployment'
import { Construct } from 'constructs'

export class SvelteKit extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id)

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
     * Lambda function that runs the serverless SvelteKit server.
     */
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

    /**
     * @see https://github.com/aws/aws-cdk/issues/1882#issuecomment-498024589
     */
    const apiOrigin = new awsCloudfrontOrigins.HttpOrigin(
      Fn.select(2, Fn.split('/', httpApi.url ?? '')),
    )

    const s3Origin = new awsCloudfrontOrigins.S3Origin(websiteBucket, {
      originAccessIdentity: cloudfrontOriginAccessIdentity,
    })

    /**
     * Cache policy specifically for Lambda, but I guess both origins will use it.
     */
    const cachePolicy = new awsCloudfront.CachePolicy(this, `${id}-cache-policy`, {
      headerBehavior: awsCloudfront.CacheHeaderBehavior.none(),
      queryStringBehavior: awsCloudfront.CacheQueryStringBehavior.none(),
      cookieBehavior: awsCloudfront.CacheCookieBehavior.none(),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true,
      minTtl: Duration.seconds(0),
      maxTtl: Duration.seconds(31536000),
      defaultTtl: Duration.seconds(0),
    })

    /**
     * Origin group that directs requests to API Gateway, then fallsback to S3.
     */
    const originGroup = new awsCloudfrontOrigins.OriginGroup({
      primaryOrigin: apiOrigin,
      fallbackOrigin: s3Origin,
      fallbackStatusCodes: [403, 404, 405, 414, 416, 500, 502, 503, 504],
    })

    /**
     * CloudFront serves as a reverse-proxy.
     */
    const distribution = new awsCloudfront.Distribution(this, `${id}-cloudfront-distribution`, {
      defaultBehavior: {
        origin: originGroup,
        allowedMethods: awsCloudfront.AllowedMethods.ALLOW_ALL,
        cachedMethods: awsCloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cachePolicy,
        viewerProtocolPolicy: awsCloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
    })

    /**
     * Upload the built static website's assets to the S3 bucket.
     */
    new s3Deployment.BucketDeployment(this, `${id}-bucket-deployment`, {
      sources: [s3Deployment.Source.asset('./build/s3')],
      destinationBucket: websiteBucket,
      distribution: distribution,
      distributionPaths: ['/*'],
    })
  }
}
