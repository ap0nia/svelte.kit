import type { Writable } from 'node:stream'

import type { APIGatewayProxyEvent, APIGatewayProxyEventV2, Context } from 'aws-lambda'

export type AwsLambda = {
  /**
   * Creates a response stream from a handler function.
   * @example
   * ```js
   * export const handler = awslambda.streamifyResponse(
   *   async (event, responseStream) => {
   *    responseStream.write("Streaming with Helper \n");
   *    responseStream.write("Hello 0 \n");
   *    responseStream.write("Hello 1 \n");
   *    responseStream.write("Hello 2 \n");
   *    responseStream.end();
   *    await responseStream.finished();
   *  }
   *);
   * ```
   * @see https://docs.aws.amazon.com/lambda/latest/dg/response-streaming-tutorial.html#response-streaming-tutorial-create-function-cfn
   */
  streamifyResponse: (
    handler: (
      event: APIGatewayProxyEvent | APIGatewayProxyEventV2,
      responseStream: Writable,
      context: Context,
    ) => Promise<void> | void,
  ) => void
  /**
   * Sets the http status code and headers of the response.
   * ```js
   * async (event, responseStream) => {
   *  const metadata = {
   *    statusCode: 200,
   *    headers: {
   *      "Content-Type": "application/json",
   *      "CustomHeader": "outerspace"
   *    }
   *  };
   *
   *  // Assign to the responseStream parameter to prevent accidental reuse of the non-wrapped stream.
   *  responseStream = awslambda.HttpResponseStream.from(responseStream, metadata);
   *
   *  responseStream.write("Streaming with Helper \n");
   *
   *  // ...
   *}
   * ```
   * @see https://docs.aws.amazon.com/lambda/latest/dg/response-streaming-tutorial.html#response-streaming-tutorial-create-function-cfn
   */
  HttpResponseStream: {
    from: (responseStream: Writable, metadata: ResponseStreamMetadata) => Writable
  }
}

export type ResponseStreamMetadata = {
  /**
   * HTTP status code
   * @example 200
   */
  statusCode: number
  /**
   * HTTP headers
   * @example
   * ```js
   * {
   *   "Content-Type": "application/json",
   *   "CustomHeader": "outerspace"
   * }
   * ```
   */
  headers: Record<string, string>
}
