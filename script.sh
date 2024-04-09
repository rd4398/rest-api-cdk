#!/bin/bash

BUCKET_NAME="$1"
INPUT_FILE_NAME="$2"
INPUT_TEXT="$3"
OUTPUT_FILE_NAME="output.txt"

# Download the input file from S3

aws s3 cp "s3://${BUCKET_NAME}/${INPUT_FILE_NAME}" "./${INPUT_FILE_NAME}"

# Check if the download was successful
if [ $? -ne 0 ]; then
    echo "Failed to download the input file. Exiting..."
    exit 1
fi

# Append the input text to the downloaded file
echo "${INPUT_TEXT}" >> "${INPUT_FILE_NAME}"

# Save the modified content to a new output file
mv "${INPUT_FILE_NAME}" "${OUTPUT_FILE_NAME}"

# Upload the output file to S3
aws s3 cp "./${OUTPUT_FILE_NAME}" "s3://${BUCKET_NAME}/${OUTPUT_FILE_NAME}"