"""
Example: Amazon Nova Reel text-to-video generation (async) using boto3.
"""

import base64
import os
import random
import time
from urllib.parse import urlparse

import boto3

# Replace with your own S3 bucket to store the generated video
# Format: s3://your-bucket-name/videos/
OUTPUT_S3_URI = os.environ.get(
    "OUTPUT_S3_URI",
    "s3://staticwebawsaistack-mediabucketbcbb02ba-crjbe2oeh2eo/videos/",
)
# Replace with your input image S3 URI
# Format: s3://your-bucket-name/images/your-image.jpg
INPUT_S3_URI = os.environ.get(
    "INPUT_S3_URI",
    "s3://staticwebawsaistack-mediabucketbcbb02ba-crjbe2oeh2eo/images/frieren.jpg",
)


def parse_s3_uri(s3_uri):
    parsed = urlparse(s3_uri)
    if parsed.scheme != "s3" or not parsed.netloc or not parsed.path:
        raise ValueError(f"Invalid S3 URI: {s3_uri}")
    return parsed.netloc, parsed.path.lstrip("/")


def load_image_bytes(s3_client, s3_uri):
    bucket, key = parse_s3_uri(s3_uri)
    response = s3_client.get_object(Bucket=bucket, Key=key)
    return response["Body"].read()


def start_text_to_video_generation_job(
    bedrock_runtime, s3_client, prompt, output_s3_uri, input_s3_uri
):
    """
    Starts an asynchronous text-to-video generation job using Amazon Nova Reel.
    """
    model_id = "amazon.nova-reel-v1:1"
    seed = random.randint(0, 2147483646)

    image_bytes = load_image_bytes(s3_client, input_s3_uri)
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")
    image_format = "jpeg" if input_s3_uri.lower().endswith(".jpg") else "png"

    model_input = {
        "taskType": "TEXT_VIDEO",
        "textToVideoParams": {
            "text": prompt,
            "images": [
                {
                    "format": image_format,
                    "source": {"bytes": image_b64},
                }
            ],
        },
        "videoGenerationConfig": {
            "fps": 24,
            "durationSeconds": 6,
            "dimension": "1280x720",
            "seed": seed,
        },
    }

    output_config = {"s3OutputDataConfig": {"s3Uri": output_s3_uri}}

    response = bedrock_runtime.start_async_invoke(
        modelId=model_id, modelInput=model_input, outputDataConfig=output_config
    )

    return response["invocationArn"]


def query_job_status(bedrock_runtime, invocation_arn):
    """Queries the status of an asynchronous video generation job."""
    return bedrock_runtime.get_async_invoke(invocationArn=invocation_arn)


def main():
    """Generate a video from a text prompt using Amazon Nova Reel."""
    bedrock_runtime = boto3.client("bedrock-runtime", region_name="us-east-1")
    s3_client = boto3.client("s3", region_name="us-east-1")
    prompt = "Breeze of wind and sea waves. The character walking slowly toward the camera."

    if "REPLACE-WITH-YOUR-S3-BUCKET" in OUTPUT_S3_URI:
        print(
            "ERROR: Set OUTPUT_S3_URI to your S3 bucket URI, e.g. s3://my-bucket/videos/"
        )
        return
    if "REPLACE-WITH-YOUR-S3-BUCKET" in INPUT_S3_URI:
        print(
            "ERROR: Set INPUT_S3_URI to your image URI, e.g. s3://my-bucket/images/input.jpg"
        )
        return

    print("Submitting video generation job...")
    invocation_arn = start_text_to_video_generation_job(
        bedrock_runtime, s3_client, prompt, OUTPUT_S3_URI, INPUT_S3_URI
    )
    print(f"Job started with invocation ARN: {invocation_arn}")

    while True:
        print("\nPolling job status...")
        job = query_job_status(bedrock_runtime, invocation_arn)
        status = job["status"]

        if status == "Completed":
            bucket_uri = job["outputDataConfig"]["s3OutputDataConfig"]["s3Uri"]
            print(f"\nSuccess! The video is available at: {bucket_uri}/output.mp4")
            break
        if status == "Failed":
            print(f"\nVideo generation failed: {job.get('failureMessage', 'Unknown error')}")
            break

        print("In progress. Waiting 15 seconds...")
        time.sleep(15)


if __name__ == "__main__":
    main()
