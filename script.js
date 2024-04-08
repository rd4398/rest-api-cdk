const AWS = require('aws-sdk');
const fs = require('fs');

// Set up AWS credentials and region
AWS.config.update({ region: 'us-east-1' });
const dynamodb = new AWS.DynamoDB.DocumentClient();
const s3 = new AWS.S3();

// Constants
const tableName = 'my-dynamodb-table';
const bucketName = 'fovus-project-bucket';
const inputFileKey = 'test.txt';
const outputFileKey = 'output.txt';

async function main(id) {
  try {
    // Step a: Get input from DynamoDB File Table by id
    const dynamoDBParams = {
      TableName: tableName,
      Key: { id: id }
    };
    const dynamoDBResponse = await dynamodb.get(dynamoDBParams).promise();
    const inputText = dynamoDBResponse.Item.input_text;

    // Step b: Download input file from S3
    const s3Params = {
      Bucket: bucketName,
      Key: inputFileKey
    };
    const s3Response = await s3.getObject(s3Params).promise();
    const inputFilePath = '/tmp/test.txt'; // Set your desired local path here
    fs.writeFileSync(inputFilePath, s3Response.Body.toString());

    // Step c: Append retrieved input text to downloaded input file
    const outputText = `${s3Response.Body.toString()} : ${inputText}`;
    fs.appendFileSync(inputFilePath, outputText);

    // Step d: Upload output file to S3
    const outputFileParams = {
      Bucket: bucketName,
      Key: outputFileKey,
      Body: fs.createReadStream(inputFilePath)
    };
    await s3.upload(outputFileParams).promise();

    // Step e: Save outputs and S3 path in DynamoDB File Table
    const dynamoDBUpdateParams = {
      TableName: tableName,
      Key: { id: id },
      UpdateExpression: 'SET output_file_path = :outputFilePath',
      ExpressionAttributeValues: {
        ':outputFilePath': `s3://${bucketName}/${outputFileKey}`
      }
    };
    await dynamodb.update(dynamoDBUpdateParams).promise();

    console.log('Process completed successfully!');
  } catch (error) {
    console.error('Error:', error);
  }
}

// Call the main function with desired id
main("aaa");
