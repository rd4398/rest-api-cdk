const { EC2Client, RunInstancesCommand } = require("@aws-sdk/client-ec2");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");
const { UserData } = require("aws-cdk-lib/aws-ec2");
import { nanoid } from "nanoid";

// Initialize the EC2 service interface object to interact with Amazon EC2.
const ec2 = new EC2Client({region:'us-east-1'});
// Initialize the DynamoDB DocumentClient to interact with DynamoDB in a more flexible way than the standard client.
const dynamoDB = new DynamoDBClient({});

// Retrieve DynamoDB Table Name environment variable
const tableName = process.env.TABLE_NAME;
const scriptBucket = process.env.SCRIPT_BUCKET;
const scriptFileName = process.env.SCRIPT_S3_KEY;
const ID = nanoid();
const outPutFileName = "output.txt";
let bname = "";

// Lambda handler function
exports.handler = async (event) => {
        const record = event.Records[0];
        // Check if the event is an INSERT event
        if (record.eventName === "INSERT") {
            // Unmarshall the DynamoDB data to a regular JavaScript object.
            const newItem = unmarshall(record.dynamodb.NewImage);
            
            // Extract the bucket name and file name from the filePath attribute of the new item.
            if (newItem.input_file_path){
                const parts = newItem.input_file_path.split('/');
                const bucketName = parts[0];
                const fileName = parts[parts.length - 1];
                const inputText = newItem.input_text;
            

            if (inputText === "eof") {
                console.log('No update required');
                return;
            } 
            
            const userDataScript = `#!/bin/bash
            aws s3 cp s3://${scriptBucket}/${scriptFileName} .
            chmod +x ${scriptFileName}
            ./${scriptFileName} ${bucketName} ${fileName} ${inputText}
            aws ec2 terminate-instances
            `;

            const initScript = Buffer.from(userDataScript).toString('base64');

            // Parameters for launching a new EC2 instance
            const params = {
                ImageId: 'ami-051f8a213df8bc089',
                InstanceType: 't2.micro',
                MinCount: 1,
                MaxCount: 1,
                UserData: initScript,
                
            };

            try {
                const launchInstance = await ec2.send(new RunInstancesCommand(params));
                console.log("EC2 Instance launched: ", launchInstance);
            } catch (error) {
                console.error("Error launching EC2 Instance: ", error);
                throw error;
            }
            bname = bucketName
        }

            // Parameters for inserting a new item into the DynamoDB table
            const dbparams = {
                TableName: tableName,
                Item: {
                    pk: {S: ID},
                    id: {S: ID },
                    output_file_path: {S: bname + "/" + outPutFileName },
                    output_string: {S: "success"}
                }
            }
            console.log("DynamoDB put parameters:", dbparams);
            await dynamoDB.send(new PutItemCommand(dbparams));
            console.log("Send command successful");
        }
    
    
};