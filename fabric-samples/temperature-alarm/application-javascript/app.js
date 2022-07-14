/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const {Gateway, Wallets} = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser')
const app = express();
const port = 3000;
const path = require('path');
const {buildCAClient, registerAndEnrollUser, enrollAdmin} = require('../../test-application/javascript/CAUtil.js');
const {buildCCPOrg1, buildWallet} = require('../../test-application/javascript/AppUtil.js');

const channelName = 'mychannel';
const chaincodeName = 'basic';
const mspOrg1 = 'Org1MSP';
const walletPath = path.join(__dirname, 'wallet');
const org1UserId = 'appUser';

async function  registerContractEventListener(){
    try {

        const ccp = buildCCPOrg1();
        const caClient = buildCAClient(FabricCAServices, ccp, 'ca.org1.example.com');
        const wallet = await buildWallet(Wallets, walletPath);
        await enrollAdmin(caClient, wallet, mspOrg1);
        await registerAndEnrollUser(caClient, wallet, mspOrg1, org1UserId, 'org1.department1');

        const gateway = new Gateway();
            await gateway.connect(ccp, {
                wallet,
                identity: org1UserId,
                discovery: {enabled: true, asLocalhost: true}
            });

            const network = await gateway.getNetwork(channelName);
            const contract = network.getContract(chaincodeName);
            await contract.addContractListener(async (event) => {
                if(event.getTransactionEvent().isValid){
                    const payload = JSON.parse(event.payload.toString('utf8'));
                    console.log("the following event arrived" + event.eventName);
                    if(payload.customEvent != null){
                        alarmServer(payload);
                    }
                }
            });

    } catch (error) {
        console.error(`******** FAILED to register listener to application: ${error}`);
    }
}


async function communicateWithNetwork(message) {
    try {

        const ccp = buildCCPOrg1();

        const  wallet = await buildWallet(Wallets, walletPath);

        const gateway = new Gateway();

        try {
            await gateway.connect(ccp, {
                wallet,
                identity: org1UserId,
                discovery: {enabled: true, asLocalhost: true}
            });
            const network = await gateway.getNetwork(channelName);

            const contract = network.getContract(chaincodeName);

            await contract.submitTransaction('UpdateAsset', message.deviceId,message.metadata.deviceName , message.metadata.room, message.temperature);
            console.log('*** Result: committed');

        } finally {
            gateway.disconnect();
        }
    } catch (error) {
        console.error(`******** FAILED: ${error}`);
    }
}

async function registerAsset(response) {
    try {
        const ccp = buildCCPOrg1();

        const  wallet = await buildWallet(Wallets, walletPath);

        const gateway = new Gateway();

        try {
            await gateway.connect(ccp, {
                wallet,
                identity: org1UserId,
                discovery: {enabled: true, asLocalhost: true}
            });
            const network = await gateway.getNetwork(channelName);
            const contract = network.getContract(chaincodeName);
            let result = await contract.submitTransaction('CreateAsset',response.id, response.apiKey,
                response.deviceName,response.temperatureThreshold,response.temperature);
        } finally {
            gateway.disconnect();
        }
    } catch (error) {
        console.error(`******** FAILED registering asset: ${error}`);
    }

}

async function changeTemp(response) {
    try {
        const ccp = buildCCPOrg1();

        const  wallet = await buildWallet(Wallets, walletPath);

        const gateway = new Gateway();

        try {
            await gateway.connect(ccp, {
                wallet,
                identity: org1UserId,
                discovery: {enabled: true, asLocalhost: true}
            });
            const network = await gateway.getNetwork(channelName);
            const contract = network.getContract(chaincodeName);
            let result = await contract.submitTransaction('UpdateTemperatureThreshold',response.id, response.temperatureThreshold);
        } finally {
            gateway.disconnect();
        }
    } catch (error) {
        console.error(`******** FAILED registering asset: ${error}`);
    }

}

function alarmServer(payload) {
    axios
        .post(`http://localhost:8080/api/v1/${payload.apiKey}/telemetry`, {
            temperature: payload.temperature,
            isOutOfRange: payload.isOutOfRange,
            alarm: payload.alarm
        })
        .then(res => {
            console.log(`statusCode: ${res.status}`);
        })
        .catch(error => {
            console.log("error ocurred");
            console.log(error)
        });
}

app.use(bodyParser.urlencoded({extended: false}))

app.use(bodyParser.json())

app.post('/thingsboard', (req, res) => {
    communicateWithNetwork(req.body);
});

app.post('/register-asset', (req, res) => {
    registerAsset(req.body);
});

app.post('/change-temperature',(req,res)=>{
    changeTemp(req.body);
});

app.listen(port, () => {
    registerContractEventListener();
    console.log(`app listening at http://localhost:${port}`)
});
