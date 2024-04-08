import { APIGatewayProxyEvent } from 'aws-lambda';
import { insert } from '../handlers/data/insert';

export const handler = async (event: APIGatewayProxyEvent) => {
  try {
    // Handle HTTP POST
    switch (event.httpMethod) {
      case 'POST':
        return await insert(event.body);
      default:
        return {
          statusCode: 400,
          body: JSON.stringify({ message: 'Invalid HTTP method' }),
        };
    }
  } catch (error) {
    console.log(error);

    return {
      statusCode: 500,
      body: JSON.stringify({ message: error }),
    };
  }
};