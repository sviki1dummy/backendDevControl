import { deviceDBSingletonFactory, usersDBSingletonFactory } from "../../../firestoreDB/singletonService";
import { DeviceDB } from "../../../firestoreDB/devices/deviceDB";
import { UsersDB } from "../../../firestoreDB/users/userDB";
import { IRenameDeviceReq } from "../../../models/API/deviceCreateAlterReqRes";
import { IDevice, IUser } from "../../../models/basicModels";

var express = require('express');
var router = express.Router();

var deviceDb: DeviceDB = deviceDBSingletonFactory.getInstance();
var userDb: UsersDB = usersDBSingletonFactory.getInstance();

router.post('/', async (req: any, res: any) => {
    var renameDeviceReq: IRenameDeviceReq = req.body;
    let user: IUser;
    try {
        user = await userDb.getUserByToken(renameDeviceReq.authToken, true);
    } catch (e) {
        res.status(400);
        res.send(e.message)
        return;
    }
    
    let device: IDevice;
    try {
        device = await deviceDb.getDevicebyId(renameDeviceReq.deviceId);
    } catch (e) {
        res.status(400);
        res.send(e.message)
        return;
    }

    if(device.userAdminId != user.id){
        res.status(400);
        res.send('User isn\'t admin');
        return;
    }

    try {
        await deviceDb.renameDevice(renameDeviceReq.deviceId, renameDeviceReq.deviceName);
    } catch (e) {
        res.status(400);
        res.send(e.message);
        return;
    }
    res.sendStatus(200);
});

module.exports = router;