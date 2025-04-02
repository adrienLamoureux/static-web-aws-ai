#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { StaticWebAWSAIStack } from "../lib/static-web-aws-ai-stack";

const app = new cdk.App();
new StaticWebAWSAIStack(app, "StaticWebAWSAIStack");
