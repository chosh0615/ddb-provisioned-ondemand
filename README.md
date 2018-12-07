### Prerequisite
* Need CloudWatch read permission

### Run
```
node index.js [config.json] [TableName] [LookBackDays]
```

where config.json looks like
```
{
    "accessKeyId": "id",
    "secretAccessKey": "key",
    "region": "us-east-1"
}

```

