const { EC2Client, RunInstancesCommand } = require("@aws-sdk/client-ec2");
const { DynamoDBClient, PutItemCommand } = require("@aws-sdk/client-dynamodb");
const { unmarshall } = require("@aws-sdk/util-dynamodb");

// Initialize the EC2 service interface object to interact with Amazon EC2.
const ec2 = new EC2Client({});
// Initialize the DynamoDB DocumentClient to interact with DynamoDB in a more flexible way than the standard client.
const dynamoDB = new DynamoDBClient({});

// Retrieve DynamoDB Table Name environment variable
const tableName = process.env.TABLE_NAME;

// Lambda handler function invoked when dynamoDbStreamLambda is executed
exports.handler = async (event) => {
    console.log("Event: ", JSON.stringify(event, null, 2));
    for (const record of event.Records) {
        // Check if the event is an INSERT event, indicating new data added to the source DynamoDB table.
        if (record.eventName === "INSERT") {
            // Unmarshall the DynamoDB data to a regular JavaScript object.
            const newItem = unmarshall(record.dynamodb.NewImage);
            
            // Extract the bucket name and file name from the filePath attribute of the new item.
            const parts = newItem.input_file_path.split('/');
            const bucketName = parts[0];
            const fileName = parts[parts.length - 1];
            const inputText = newItem.input_text;

            // Generate the output file name by prefixing the input file name.
            const outPutFileName = "Output-" + fileName;

            // Skip processing and exit the function if the input text indicates end of file (eof).
            if (inputText === "eof") {
                console.log('No update required');
                return;
            }            

            // Parameters for launching a new EC2 instance, including the AMI ID, instance type, and user data script.
            const params = {
                ImageId: 'ami-051f8a213df8bc089',
                InstanceType: 't2.micro',
                MinCount: 1,
                MaxCount: 1,
                // IamInstanceProfile: {
                //     Name: "EC2S3AccessRole" // IAM Role as passed by lambda used to Access S3 buckets
                // },
            };

            try {
                const launchInstance = await ec2.send(new RunInstancesCommand(params));
                console.log("EC2 Instance launched: ", launchInstance);
            } catch (error) {
                console.error("Error launching EC2 Instance: ", error);
                throw error;
            }

            // Parameters for inserting a new item into the DynamoDB table to indicate processing completion.
            const dbparams = {
                TableName: tableName,
                Item: {
                    id: { S: "1" },
                    text: { S: "eof" },
                    filePath: { S: bucketName + "/public/" + outPutFileName },
                    createdAt: { S: new Date().toISOString() },
                }
            }
            console.log("DynamoDB put parameters:", dbparams);
            await dynamoDB.send(new PutItemCommand(dbparams));
            
        }
    }
    
};
