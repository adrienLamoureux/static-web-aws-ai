const {
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} = require("@aws-sdk/lib-dynamodb");

const {
  buildMediaPk,
  buildMediaSk,
} = require("./keys");

const createMediaStore = ({ dynamoClient, mediaTable }) => {
  const putMediaItem = async ({ userId, type, key, extra = {} }) => {
    if (!mediaTable || !userId || !key) return;
    const item = {
      pk: buildMediaPk(userId),
      sk: buildMediaSk(type, key),
      type,
      key,
      createdAt: new Date().toISOString(),
      ...extra,
    };
    await dynamoClient.send(
      new PutCommand({
        TableName: mediaTable,
        Item: item,
      })
    );
  };

  const deleteMediaItem = async ({ userId, type, key }) => {
    if (!mediaTable || !userId || !key) return;
    await dynamoClient.send(
      new DeleteCommand({
        TableName: mediaTable,
        Key: {
          pk: buildMediaPk(userId),
          sk: buildMediaSk(type, key),
        },
      })
    );
  };

  const queryMediaItems = async ({ userId, type }) => {
    if (!mediaTable || !userId) return [];
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: mediaTable,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": buildMediaPk(userId),
          ":skPrefix": `${type}#`,
        },
        ScanIndexForward: false,
      })
    );
    return response.Items || [];
  };

  const getItem = async ({ pk, sk }) => {
    if (!mediaTable || !pk || !sk) return null;
    const response = await dynamoClient.send(
      new GetCommand({
        TableName: mediaTable,
        Key: { pk, sk },
      })
    );
    return response.Item || null;
  };

  const queryBySkPrefix = async ({
    pk,
    skPrefix,
    limit = 100,
    scanForward = true,
  }) => {
    if (!mediaTable || !pk || !skPrefix) return [];
    const response = await dynamoClient.send(
      new QueryCommand({
        TableName: mediaTable,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :skPrefix)",
        ExpressionAttributeValues: {
          ":pk": pk,
          ":skPrefix": skPrefix,
        },
        ScanIndexForward: scanForward,
        Limit: limit,
      })
    );
    return response.Items || [];
  };

  return {
    putMediaItem,
    deleteMediaItem,
    queryMediaItems,
    getItem,
    queryBySkPrefix,
  };
};

module.exports = {
  createMediaStore,
};
