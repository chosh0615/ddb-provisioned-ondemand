var AWS = require('aws-sdk');

if(process.argv.length < 5) {
  console.log("Usage : node ddb-cost.js [config.json] [TableName] [LookBackDays]");
  exit(1);
}

AWS.config.loadFromPath('/home/seonc/.aws/config.json');
var ddb = new AWS.DynamoDB();
var cloudwatch = new AWS.CloudWatch();

const tableName = process.argv[3];

const ONDEMAND_WRITE_COST = 0.00000125;
const ONDEMAND_READ_COST = 0.00000025;
const PROVISIONED_WRITE_COST = 0.00065;
const PROVISIONED_READ_COST = 0.00013;

const lookBack = process.argv[4];
const END_TIME = new Date();
const START_TIME = new Date();
START_TIME.setDate(END_TIME.getDate() - lookBack);

const YEAR_HOURS = (END_TIME - START_TIME) / 1000 / 60 / 60;

var provisionedWriteTotal = 0;
var consumedWriteTotal = 0;
var provisionedReadTotal = 0;
var consumedReadTotal = 0;

function start() {
  // Table + get all indices...
  let desc = {
    TableName: tableName
  };
  ddb.describeTable(desc, async function(err, data) {
    let gsis = data.Table.GlobalSecondaryIndexes;
    console.log("This table has " + gsis.length + " index");
    console.log(gsis.map(gsi => gsi.IndexName).reduce((a,b) => a + ", " + b));
    console.log("------------------------------------------------------");

    gsis.push({IndexName: ''});  // Table
    
    // Write Provisioned
    var promises = gsis.map(gsi => {
      return new Promise((resolve, reject) => {
        getMetricAvg(gsi.IndexName, 'ProvisionedWriteCapacityUnits', resolve, reject);
      });
    });

    try {
        let values = await Promise.all(promises);
        provisionedWriteTotal = values.reduce((a, b) => a + b);
        console.log("provisionedWriteTotal " + provisionedWriteTotal);
    } catch(e){
        console.log(e);
    }

    // Write Consumed
    var promises = gsis.map(gsi => {
      return new Promise((resolve, reject) => {
        getMetricAvg(gsi.IndexName, 'ConsumedWriteCapacityUnits', resolve, reject);
      });
    });

    try {
        let values = await Promise.all(promises);
        consumedWriteTotal = values.reduce((a, b) => a + b);
        console.log("consumedWriteTotal " + consumedWriteTotal);
    } catch(e){
        console.log(e);
    }

    // Read Provisioned
    var promises = gsis.map(gsi => {
      return new Promise((resolve, reject) => {
        getMetricAvg(gsi.IndexName, 'ProvisionedReadCapacityUnits', resolve, reject);
      });
    });

    try {
        let values = await Promise.all(promises);
        provisionedReadTotal = values.reduce((a, b) => a + b);
        console.log("provisionedReadTotal " + provisionedReadTotal);
    } catch(e){
        console.log(e);
    }

    // WriteProvisioned
    var promises = gsis.map(gsi => {
      return new Promise((resolve, reject) => {
        getMetricAvg(gsi.IndexName, 'ConsumedReadCapacityUnits', resolve, reject);
      });
    });

    try {
        let values = await Promise.all(promises);
        consumedReadTotal = values.reduce((a, b) => a + b);
        console.log("consumedReadTotal " + consumedReadTotal);
    } catch(e){
        console.log(e);
    }

    let provisionedWriteCost = YEAR_HOURS * provisionedWriteTotal * PROVISIONED_WRITE_COST;
    let provisionedReadCost = YEAR_HOURS * provisionedReadTotal * PROVISIONED_READ_COST;
    let ondemandWriteCost = consumedWriteTotal * ONDEMAND_WRITE_COST;
    let ondemandReadCost = consumedReadTotal * ONDEMAND_READ_COST;

    console.log("------------------------------------------------------");

    console.log("Write cost with Provisioned: " + provisionedWriteCost);
    console.log("Write cost with Ondemand   : " + ondemandWriteCost);
    console.log("Read cost with Provisioned : " + provisionedReadCost);
    console.log("Read cost with Ondemand    : " + ondemandReadCost);

    console.log("------------------------------------------------------");
    let provisionedCost = provisionedWriteCost + provisionedReadCost;
    let ondemandCost = ondemandWriteCost + ondemandReadCost;
    console.log("Total cost with Provisioned : " + provisionedCost);
    console.log("Total cost with Ondemand.   : " + ondemandCost);

    console.log("------------------------------------------------------");
    if(provisionedCost < ondemandCost) {
      console.log("Provisioned cost is cheaper!");
    }
    else if(provisionedCost > ondemandCost) {
      console.log("On-demand cost is cheaper!");
    }
    else {
      console.log("Wow! Two costs are the same!")
    }

  });
}

function getMetricAvg(gsiName, metricName, resolve, reject) {
  let stat = metricName.startsWith('Consumed') ? 'Sum' : 'Average';

  let params = {
    StartTime: START_TIME,
    EndTime: END_TIME,
    MetricName: metricName,
    Namespace: 'AWS/DynamoDB',
    Period: 300000000,
    Dimensions: [
      {
        Name: 'TableName',
        Value: tableName
      }
    ],
    Statistics: [
      stat
    ]
  };

  if(gsiName != '') {
    params.Dimensions.push({
      Name: 'GlobalSecondaryIndexName',
      Value: gsiName
    });
  }

  cloudwatch.getMetricStatistics(params, function(err, data) {
    if (err) {
      console.log(err, err.stack); // an error occurred
      reject(err);
    }
    else {

      let v = data.Datapoints.map(d => d[stat])
        .reduce((a, b) => a + b)
      if(stat == 'Average') {
        v = v / data.Datapoints.length;
      }
      resolve(v);
    }
  });
}

start();


