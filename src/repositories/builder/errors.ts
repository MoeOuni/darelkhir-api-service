export class DynamoDBThrottleError extends Error {
  constructor(message = 'DynamoDB throughput exceeded') {
    super(message);
    this.name = 'DynamoDBThrottleError';
  }
}

export class ConditionalCheckFailedError extends Error {
  constructor(message = 'Conditional check failed') {
    super(message);
    this.name = 'ConditionalCheckFailedError';
  }
}

export class ResourceNotFoundError extends Error {
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'ResourceNotFoundError';
  }
}
