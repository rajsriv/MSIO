import AWS from 'aws-sdk';
import dotenv from 'dotenv';

dotenv.config();

const s3 = new AWS.S3({
  accessKeyId: process.env.S3_ACCESS_KEY_ID,
  secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  endpoint: process.env.S3_ENDPOINT, // Optional for Minio/LocalStack
  s3ForcePathStyle: true, // Required for Minio
  signatureVersion: 'v4',
});

export const bucketName = process.env.S3_BUCKET_NAME || 'msio-deployments';

export default s3;
