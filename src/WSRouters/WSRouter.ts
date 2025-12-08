import { IWSSMessage, IWSSBasicConnection, IWSSConnectionDevice, IWSSConnectionUser, IWSSDeviceConnectRequest, IWSSUserConnectRequest } from 'models/WSS/wssConnectionReqRes';
import { server, request, connection, Message } from 'websocket';
import { addDeviceConnection, addUserConnection } from './subrouter/WSConnect';
import { v4 as uuidv4 } from 'uuid';
import { getCurrentTimeISO, getCurrentTimeUNIX } from '../generalStuff/timeHandlers';
import { IDevice, IUser } from 'models/basicModels';
import { ERightType } from '../models/userRightsModels';
import { ELogoutReasons, IDeviceForUser, ILoggedReason, IWSSMessageForUser } from '../models/frontendModels';
import { deviceServiceSingletonFactory, userPermissionServiceSingletonFactory, userServiceSingletonFactory } from "../services/serviceSingletonFactory";
import { UserService } from "../services/userService";
import { DeviceService } from "../services/deviceService";
import { UserPermissionService } from "services/userPermissionService";

var userService: UserService = userServiceSingletonFactory.getInstance();
var deviceService: DeviceService = deviceServiceSingletonFactory.getInstance();
var userPermissionService: UserPermissionService = userPermissionServiceSingletonFactory.getInstance();

const WSRouterEmit_CheckInterval = 50;
const WSRouter_SlowTapInterval = 500;
const WSRouter_SlowTap_OverrideInterval = WSRouter_SlowTapInterval + WSRouterEmit_CheckInterval + 5; //avoid collision from slowTap emit and a "normal" emit

export class MyWebSocketServer {
    private wsServer: server;

    private allClients: IWSSBasicConnection[] = [];
    private userClients: IWSSConnectionUser[] = [];
    private deviceClients: IWSSConnectionDevice[] = [];

    private userDataEmitQueue: IWSSConnectionUser[] = [];
    private deviceDataEmitQueue: IWSSConnectionDevice[] = [];

    private acceptWS: boolean;

    public setupServer(server: server) {
        this.wsServer = server;

        this.wsServer.on('request', (request: request) => {
            console.log('new r');
            if(this.acceptWS == false){
                request.reject();
                return;
            }

            let connection = request.accept(null, request.origin);
            let newConnection: IWSSBasicConnection = {
                connection: connection,
                connectionUUID: uuidv4(),
                startedAt: getCurrentTimeISO(),
            };
            this.allClients.push(newConnection);
            console.log('uuid in reqq ' + newConnection.connectionUUID);

            newConnection.connection.on('message', async (message: Message) => {
                if (message.type !== 'utf8') return;

                if (message.utf8Data.includes("clear")) {
                    for (let client of this.allClients) {
                        client.connection.close()
                    }
                    this.allClients = []
                    this.userClients = []
                    this.deviceClients = []
                }

                let wsMessage: IWSSMessage;
                try {
                    wsMessage = JSON.parse(message.utf8Data);
                } catch {
                    return;
                }

                console.log(wsMessage)
                switch (wsMessage.messageType) {
                    case 'connectUser':
                        let connectUserRequest = wsMessage.data as IWSSUserConnectRequest;
                        let userConn = await addUserConnection(connectUserRequest, newConnection);
                        if (!userConn) {
                            let logoutData: ILoggedReason = { logoutReason: ELogoutReasons.LogoutMyself }
                            newConnection.connection.sendUTF(JSON.stringify(logoutData));
                            setTimeout(() => {
                                newConnection.connection.close();
                            }, 5000);
                            return
                        }
                        this.userClients.push(userConn);
                        console.log('user connected')
                        this.emitUserDataToConnection(userConn);
                        break;
                    case 'connectDevice':
                        let connectDevRequest = wsMessage.data as IWSSDeviceConnectRequest;
                        console.log(connectDevRequest);
                        let devConn = await addDeviceConnection(connectDevRequest, newConnection);
                        if (!devConn) break;
                        this.deviceClients.push(devConn);
                        console.log('new uuid: ' + devConn.basicConnection.connectionUUID);
                        console.log("dev clients N: " + this.deviceClients.length);
                        console.log("emited data to device")
                        this.emitDeviceRegistration(connectDevRequest.deviceKey)
                        break;
                    default:
                        console.log('unprocessed message');
                        console.log(wsMessage);
                        break;
                }
            });
        });

        this.wsServer.on('close', (connection: connection, reason: number, desc: string) => {
            console.log('closed conn');

            for (let i = 0; i < this.allClients.length; i++) {
                if (this.allClients[i].connection === connection) {
                    this.allClients.splice(i, 1);
                }
            }
            for (let i = 0; i < this.deviceClients.length; i++) {
                if (this.deviceClients[i].basicConnection.connection === connection) {
                    console.log('closed ' + this.deviceClients[i].basicConnection.connectionUUID);
                    let deviceId = this.deviceClients[i].deviceId
                    this.deviceClients.splice(i, 1);
                    i--;
                    console.log("dev clients N: " + this.deviceClients.length);
                    this.emitDeviceRegistrationById(deviceId)
                }
            }
            for (let i = 0; i < this.userClients.length; i++) {
                if (this.userClients[i].basicConnection.connection === connection) {
                    console.log(this.userClients[i].authToken)
                    console.log("closed " + this.userClients[i].basicConnection.connectionUUID);
                    this.userClients.splice(i, 1);
                    return;
                }
            }
        });

        setInterval(() => {
            for (let i = 0; i < this.userDataEmitQueue.length; i++) {
                let connection = this.userDataEmitQueue[i];
                if (getCurrentTimeUNIX() - connection.lastEmited > WSRouter_SlowTapInterval) {
                    this.emitUserDataToConnection(connection).then(() => {
                        connection.lastEmited = getCurrentTimeUNIX();
                    });
                    this.userDataEmitQueue.splice(i, 1);
                    i--;
                }
            }

            if(this.deviceDataEmitQueue.length > 0){
                let devsQ: number[] = [];
                for(let i = 0; i<this.deviceDataEmitQueue.length; i++){
                    let devConnInQ = this.deviceDataEmitQueue[i];
                    devsQ.push(devConnInQ.deviceId);
                }
                console.log(devsQ);
            }
            for(let i = 0; i<this.deviceDataEmitQueue.length; i++){
                let connection = this.deviceDataEmitQueue[i];
                if(getCurrentTimeUNIX() - connection.lastEmited > WSRouter_SlowTapInterval) {
                    //send data
                    this.emitDeviceDataToConnection(connection).then( () => {
                        // connection.lastEmited = getCurrentTimeUNIX();
                    });

                    this.deviceDataEmitQueue.splice(i, 1);
                    i--;
                }
            }
        }, WSRouterEmit_CheckInterval)
    }

    //<logout>
    async logoutAllUsersSessions(userId: number, reason: ELogoutReasons, safeToken?: string) {
        let clients = this.userClients.filter(client => client.userId === userId);
        let logoutReason: ILoggedReason = { logoutReason: reason };
        let message: IWSSMessageForUser = {
            messageType: "userMessage",
            data: logoutReason,
        }
        for (let client of clients) {
            if (client.authToken === safeToken) continue;
            client.basicConnection.connection.sendUTF(JSON.stringify(message));
            setTimeout(() => {
                try {
                    client.basicConnection.connection.close();
                } catch {
                    console.log('failed to close ' + client.userId);
                }
            }, 5000);
        }
    }

    async logoutUserSession(token: string, reason: ELogoutReasons) {
        let clients = this.userClients.filter(client => client.authToken === token);
        let logoutReason: ILoggedReason = { logoutReason: reason };
        let message: IWSSMessageForUser = {
            messageType: "userMessage",
            data: logoutReason,
        }
        for (let client of clients) {
            client.basicConnection.connection.sendUTF(JSON.stringify(message));
            setTimeout(() => {
                try {
                    client.basicConnection.connection.close();
                } catch {
                    console.log('failed to close ' + client.userId);
                }
            }, 1000);
        }
    }
    //</logout>

    //<reasons to emit data>
    async emitDeviceRegistrationById(deviceId: number) {
        let device = await deviceService.getDevicebyId(deviceId)
        await this.emitDeviceRegistration(device.deviceKey)
    }

    async emitDeviceRegistration(deviceKey: string) {
        let deviceData: IDevice;
        let allUsers: IUser[];
        try {
            allUsers = await userService.getUsers();
            deviceData = await deviceService.getDevicebyKey(deviceKey);
        } catch (e) {
            return;
        }

        let usersWithRight: IUser[] = [];
        for (let user of allUsers) {
            let right = await userPermissionService.checkAnyUserRightToDevice(user, deviceData);
            if (right) {
                usersWithRight.push(user);
            }
        }
        await this.emitDeviceConfigToDevice(deviceData);
        await this.sendAllDataToUsers(usersWithRight);
    }

    async emitFieldChanged(deviceId: number, groupId: number, fieldId: number) {
        let deviceData: IDevice = {} as IDevice;
        let allUsers: IUser[] = [];
        try {
            deviceData = await deviceService.getDevicebyId(deviceId);
            allUsers = await userService.getUsers();
        } catch {
            return;
        }

        let usersWithRight: IUser[] = [];
        for (let user of allUsers) {
            let right = await userPermissionService.checkUserRightToField(user, deviceId, groupId, fieldId, deviceData);
            if (right === ERightType.Write || right === ERightType.Read) {
                usersWithRight.push(user);
            }
        }
        await this.emitDeviceConfigToDevice(deviceData);
        await this.sendAllDataToUsers(usersWithRight);
    }

    async emitComplexGroupChanged(deviceId: number, complexGroupId: number) { //state or field
        let deviceData: IDevice = {} as IDevice;
        let allUsers: IUser[] = [];
        try {
            deviceData = await deviceService.getDevicebyId(deviceId);
            allUsers = await userService.getUsers();
        } catch {
            return;
        }


        let usersWithRight: IUser[] = [];
        for (let user of allUsers) {
            let right = await userPermissionService.checkUserRightToComplexGroup(user, deviceId, complexGroupId, deviceData);
            if (right === ERightType.Write || right === ERightType.Read) {
                usersWithRight.push(user);
            }
        }
        await this.emitDeviceConfigToDevice(deviceData);
        await this.sendAllDataToUsers(usersWithRight);
    }

    async emitUserRightUpdate(userId: number) {
        let user = await userService.getUserbyId(userId);
        for (let userClient of this.userClients) {
            if (userClient.userId !== user.id) continue;
            this.sendAllDataToUsers([user]);
        }
    }

    async emitDeviceDeleted(users: IUser[]) {
        await this.sendAllDataToUsers(users);
    }
    //</reasons to emit data>

    //<single connection emit>
    private async emitUserDataToConnection(userConnection: IWSSConnectionUser) {
        let devices = await deviceService.getDevices();
        let user = await userService.getUserbyId(userConnection.userId);

        let userData = JSON.stringify(await this.getAllDeviceDataMessageForUser(devices, user));
        this.sendDataToUserConnection(userData, userConnection);
    }

    private async emitDeviceDataToConnection(deviceConnection: IWSSConnectionDevice){
        let device = await deviceService.getDevicebyId(deviceConnection.deviceId);
        await this.emitDeviceConfigToDevice(device);
    }
    //<single connection emit>


    //<collect data>
    private async getAllDeviceDataMessageForUser(allDeviceData: IDevice[], user: IUser): Promise<IWSSMessageForUser> {
        let devices: IDeviceForUser[] = [];
        for (let device of allDeviceData) {
            let isActive = this.isDeviceActive(device.id);
            let deviceForUser = await userPermissionService.getDeviceForUser(user, device, isActive);
            if (deviceForUser) {
                devices.push(deviceForUser);
            }
        }
        let message: IWSSMessageForUser = {
            messageType: "deviceData",
            data: devices,
        }
        return message;
    }
    //</collect data>


    //<send>
    private async sendAllDataToUsers(users: IUser[]) {
        let devices = await deviceService.getDevices();
        for (let user of users) {
            let userData = JSON.stringify(await this.getAllDeviceDataMessageForUser(devices, user));

            let userConnections = this.userClients.filter(o => o.userId === user.id)
            for (let connection of userConnections) {
                this.sendDataToUserConnection(userData, connection);
            }
        }
    }

    private async sendDataToUserConnection(data: string, userConnection: IWSSConnectionUser, urgent?: boolean) {
        if (urgent) {
            userConnection.basicConnection.connection.sendUTF(data);
        } else {
            let currentTime = getCurrentTimeUNIX();
            if (currentTime - userConnection.lastEmited > WSRouter_SlowTap_OverrideInterval) {
                //enough time has passed from some old emit to this connection
                userConnection.basicConnection.connection.sendUTF(data);
                userConnection.lastEmited = getCurrentTimeUNIX();
            }
            else {
                let exists = !!this.userDataEmitQueue.find(o => o.basicConnection === userConnection.basicConnection);
                if (!exists) {
                    this.userDataEmitQueue.push(userConnection);
                }
            }
        }
    }

    async emitDeviceConfigToDevice(deviceData: IDevice) {
        let currentTime = getCurrentTimeUNIX();

        let thisDevConns = this.deviceClients.filter(conn => conn.deviceId === deviceData.id);
        for (let devCon of thisDevConns) {
            if (currentTime - devCon.lastEmited > WSRouter_SlowTap_OverrideInterval) {
                devCon.basicConnection.connection.sendUTF(JSON.stringify(deviceData));
                devCon.lastEmited = currentTime;
                this.deviceDataEmitQueue = this.deviceDataEmitQueue.filter(o => o.basicConnection !== devCon.basicConnection);
            }
            else {
                console.log("want to push device to Q");
                let exists = !!this.deviceDataEmitQueue.find(o => o.basicConnection === devCon.basicConnection);
                if (!exists) {
                    this.deviceDataEmitQueue.push(devCon);
                }
            }
        }
    }
    //<send>

    private isDeviceActive(deviceId: number): boolean {
        return !!this.deviceClients.find(o => o.deviceId == deviceId)
    }


    // async logoutUserSession(token: string, reason: ELogoutReasons) {
    //     let client = this.userClients.find(client => client.authToken === token);
    //     let logoutReason: ILoggedReason = { logoutReason: reason };
    //     client?.basicConnection.connection.sendUTF(JSON.stringify(logoutReason));
    // }

    async removeAllDeviceClients(){
        for(let devCon of this.deviceClients){
            devCon.basicConnection.connection.close();
        }
        this.deviceClients = [];
    }

    async stopAccept(){
        this.acceptWS = false;
    }

    async startAccept(){
        this.acceptWS = true;
    }
}