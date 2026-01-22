#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import * as path from "path";
import { StaticWebAWSAIStack } from "../lib/static-web-aws-ai-stack";

dotenv.config({ path: path.join(__dirname, "../.env") });

const app = new cdk.App();
new StaticWebAWSAIStack(app, "StaticWebAWSAIStack");
