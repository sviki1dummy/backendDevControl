import { IComplexFieldGroup, IComplexFieldGroupState, IDevice, IDeviceFieldBasic, IDeviceFieldButton, IDeviceFieldMultipleChoice, IDeviceFieldNumeric, IDeviceFieldRGB, IDeviceFieldText, IFieldGroup, IRGB, IUser } from "models/basicModels";
import { v4 as uuidv4 } from 'uuid';
import { Db } from "../firestoreDB/db";
import { DBSingletonFactory } from "../firestoreDB/singletonService";
import { compareFields, getComplexGroup, getComplexGroupState, getDeviceField, getDeviceFieldGroup, getFieldInComplexGroup } from "./../firestoreDB/deviceStructureFunctions";
import { IDeviceForDevice } from "models/frontendModels";
import { getCurrentTimeUNIX } from "../generalStuff/timeHandlers";
import { bridge_deleteComplexGroupOnAllUsers, bridge_deleteDeviceOnAllUsers, bridge_deleteFieldOnAllUsers, bridge_deleteGroupOnAllUsers } from "./serviceBridge";
import { log } from "console";

export class DeviceService {

    private db: Db;

    constructor() {
        this.db = DBSingletonFactory.getInstance();
    }

    async getDevicebyId(id: number): Promise<IDevice> {
        return await this.db.getDevicebyId(id);
    }

    async getDevices(): Promise<IDevice[]> {
        return await this.db.getTransformedDevices();
    }

    async getDevicebyKey(key: string): Promise<IDevice> {
        return await this.db.getDevicebyKey(key);
    }

    async addDevice(deviceName: string, userAdminId: number, deviceKey?: string): Promise<number> {
        const allDevices = await this.db.getTransformedDevices();
        if (!!deviceKey) {
            if (allDevices.find(o => o.deviceKey === deviceKey)) {
                throw ({ message: 'deviceKey exists' });
            }
        } else {
            while (true) {
                deviceKey = uuidv4();//.replaceAll('-', '');//.substring(0,10);
                if (!allDevices.find(o => o.deviceKey === deviceKey)) break;
            }
        }
        const maxId = await this.db.getMaxDeviceId(true);
        const newDevice: IDevice = {
            id: maxId + 1,
            deviceName: deviceName,
            userAdminId: userAdminId,
            deviceKey: deviceKey,
            deviceFieldGroups: [],
            deviceFieldComplexGroups: [],
        }
        await this.db.addDevice(newDevice);
        return newDevice.id;
    }

    async renameDevice(deviceId: number, deviceName: string): Promise<void> {
        await this.db.renameDevice(deviceId, deviceName);
    }

    async deleteDevice(id: number) {
        this.deleteDeviceOnAllUsers(id);
        await this.db.deleteDevice(id);
    }

    async getDeviceForDevice(device: IDevice) {
        let deviceData: IDeviceForDevice = {
            id: device.id,
            deviceKey: device.deviceKey,
            deviceName: device.deviceName,
            deviceFieldGroups: device.deviceFieldGroups,
            deviceFieldComplexGroups: device.deviceFieldComplexGroups,
            userAdminId: device.userAdminId,
            updateTimeStamp: getCurrentTimeUNIX(),
        }
        return deviceData;
    }

    async addDeviceFieldGroup(deviceId: number, groupId: number, groupName: string): Promise<void> {
        // let device = await this.getDevicebyId(deviceId);
        let newGroup: IFieldGroup = {
            id: groupId,
            groupName: groupName,
            fields: [],
        }
        await this.db.addDeviceFieldGroup(deviceId, newGroup);
    }

    async renameDeviceFieldGroup(deviceId: number, groupId: number, groupName: string) {
        let device = await this.getDevicebyId(deviceId);
        getDeviceFieldGroup(device, groupId);
        await this.db.renameDeviceFieldGroup(deviceId, groupId, groupName);
    }

    async deleteDeviceFieldGroup(deviceId: number, groupId: number) {
        let device = await this.getDevicebyId(deviceId);
        getDeviceFieldGroup(device, groupId);
        await this.deleteGroupOnAllUsers(deviceId, groupId);
        await this.db.deleteDeviceFieldGroup(deviceId, groupId);
    }

    async addDeviceField(deviceId: number, groupId: number, deviceField: IDeviceFieldBasic): Promise<void> {
        await this.db.addDeviceField(deviceId, groupId, deviceField);
    }

    async renameDeviceField(deviceId: number, groupId: number, fieldId: number, fieldName: string) {
        let device = await this.getDevicebyId(deviceId);
        let groupField = getDeviceFieldGroup(device, groupId);
        getDeviceField(groupField, fieldId);
        await this.db.renameDeviceField(deviceId, groupId, fieldId, fieldName);
    }

    async deleteDeviceField(deviceId: number, groupId: number, fieldId: number) {
        let device = await this.getDevicebyId(deviceId);
        let groupField = getDeviceFieldGroup(device, groupId);
        getDeviceField(groupField, fieldId);
        await this.deleteFieldOnAllUsers(deviceId, groupId, fieldId);
        await this.db.deleteDeviceField(deviceId, groupId, fieldId);
    }

    async addComplexGroup(deviceId: number, groupId: number, groupName: string) {
        await this.getDevicebyId(deviceId);

        let newGroup: IComplexFieldGroup = {
            id: groupId,
            groupName: groupName,
            currentState: 0,
            fieldGroupStates: [],
        }

        await this.db.addComplexGroup(deviceId, newGroup);
    }

    async renameComplexGroup(deviceId: number, groupId: number, groupName: string) {
        await this.getDevicebyId(deviceId);
        await this.db.renameComplexGroup(deviceId, groupId, groupName);
    }

    async deleteComplexGroup(deviceId: number, complexGroupId: number) {
        await this.deleteComplexGroupOnAllUsers(deviceId, complexGroupId);
        await this.db.deleteComplexGroup(deviceId, complexGroupId);
    }

    async addComplexGroupState(deviceId: number, groupId: number, stateId: number, stateName: string) {
        let device = await this.getDevicebyId(deviceId);
        let group = getComplexGroup(device, groupId);

        let state: IComplexFieldGroupState = {
            id: stateId,
            stateName: stateName,
            fields: [],
        };
        await this.db.addComplexGroupState(deviceId, groupId, state);
    }

    async renameComplexGroupState(deviceId: number, groupId: number, stateId: number, stateName: string) {
        let device = await this.getDevicebyId(deviceId);
        let group = getComplexGroup(device, groupId);

        await this.db.renameComplexGroupState(deviceId, groupId, stateId, stateName);
    }

    async changeComplexGroupStateFromDevice(deviceKey: string, groupId: number, state: number) {
        let device = await this.getDevicebyKey(deviceKey);
        await this.tryToChangeComplexGroupState(device, groupId, state);
    }

    async changeComplexGroupStateFromUser(deviceId: number, groupId: number, state: number) {
        let device = await this.getDevicebyId(deviceId);
        await this.tryToChangeComplexGroupState(device, groupId, state);
    }

    async deleteComplexGroupState(deviceId: number, groupId: number, stateId: number) {
        await this.db.deleteComplexGroupState(deviceId, groupId, stateId);
    }

    async addFieldInComplexGroup(deviceId: number, groupId: number, stateId: number, fieldData: IDeviceFieldBasic) {
        let device = await this.getDevicebyId(deviceId);
        let group = getComplexGroup(device, groupId);
        let state = getComplexGroupState(group, stateId);
        await this.db.addFieldInComplexGroup(deviceId, groupId, stateId, fieldData);
    }

    async renameFieldInComplexGroup(deviceId: number, groupId: number, stateId: number, fieldId: number, fieldName: string) {
        await this.db.renameFieldInComplexGroup(deviceId, groupId, stateId, fieldId, fieldName);
    }

    async changeFieldValueInComplexGroupFromDevice(deviceKey: string, groupId: number, stateId: number, fieldId: number, fieldValue: any) {
        let device = await this.getDevicebyKey(deviceKey);
        let group = getComplexGroup(device, groupId);
        let state = getComplexGroupState(group, stateId);
        let field = getFieldInComplexGroup(state, fieldId);
        return await this.tryToChangeFieldValueInComplexGroup(device.id, groupId, stateId, field, fieldValue);
    }

    async changeFieldValueInComplexGroupFromUser(deviceId: number, groupId: number, stateId: number, fieldId: number, fieldValue: any) {
        let device = await this.getDevicebyId(deviceId);
        let group = getComplexGroup(device, groupId);
        let state = getComplexGroupState(group, stateId);
        let field = getFieldInComplexGroup(state, fieldId);
        if (field.fieldValue.fieldDirection === 'output') {
            throw ({ message: 'Field value is output only - can\'t be set by user' });
        }
        return await this.tryToChangeFieldValueInComplexGroup(device.id, groupId, stateId, field, fieldValue);
    }

    async deleteFieldInComplexGroup(deviceId: number, groupId: number, stateId: number, fieldId: number) {
        await this.db.deleteFieldInComplexGroup(deviceId, groupId, stateId, fieldId);
    }

    async changeDeviceFieldValueFromDevice(deviceKey: string, groupId: number, fieldId: number, fieldValue: any) {
        let device = await this.getDevicebyKey(deviceKey);
        let group = getDeviceFieldGroup(device, groupId);
        let field = getDeviceField(group, fieldId);
        return await this.tryToChangeDeviceFieldValue(device.id, groupId, field, fieldValue);
    }

    async changeDeviceFieldValueFromUser(deviceId: number, groupId: number, fieldId: number, fieldValue: any) {
        let device = await this.getDevicebyId(deviceId);
        let group = getDeviceFieldGroup(device, groupId);
        let field = getDeviceField(group, fieldId);

        if (field.fieldValue.fieldDirection === 'output') {
            throw ({ message: 'Field value is output only - can\'t be set by user' });
        }
        return await this.tryToChangeDeviceFieldValue(deviceId, groupId, field, fieldValue);
    }

    async registerDeviceData(deviceData: IDevice) {
        let device = await this.getDevicebyKey(deviceData.deviceKey);
        let deviceId = device.id;

        let oldDeviceGroups = device.deviceFieldGroups;
        let newDeviceGroups = deviceData.deviceFieldGroups;
        for (let oldGroup of oldDeviceGroups) {
            try {
                getDeviceFieldGroup(deviceData, oldGroup.id);
            } catch {
                await this.db.deleteDeviceFieldGroup(deviceId, oldGroup.id);
                //deleteTriggersForGroup
                device = await this.getDevicebyId(deviceId);
            }
        }
        if (newDeviceGroups) {
            for (let newGroup of newDeviceGroups) {
                let oldGroup: IFieldGroup;
                try {
                    oldGroup = getDeviceFieldGroup(device, newGroup.id);
                }
                catch {
                    await this.addDeviceFieldGroup(deviceId, newGroup.id, newGroup.groupName);
                    device = await this.getDevicebyId(deviceId);
                }
                oldGroup = getDeviceFieldGroup(device, newGroup.id);

                if (oldGroup.groupName !== newGroup.groupName) {
                    await this.db.renameDeviceFieldGroup(deviceId, newGroup.id, newGroup.groupName);
                }

                let oldDeviceFields = getDeviceFieldGroup(device, newGroup.id).fields;
                let newDeviceFields = newGroup.fields;

                for (let oldField of oldDeviceFields) {
                    try {
                        getDeviceField(newGroup, oldField.id);
                    } catch {
                        await this.db.deleteDeviceField(deviceId, newGroup.id, oldField.id);
                        //deleteTriggers for Field
                    }
                }

                for (let newField of newDeviceFields) {
                    let oldField: IDeviceFieldBasic;
                    try {
                        oldField = getDeviceField(oldGroup, newField.id);
                    }
                    catch {
                        await this.db.addDeviceField(deviceId, newGroup.id, newField);
                        device = await this.getDevicebyId(deviceId);
                        continue;
                    }
                    if (newField.fieldName !== oldField.fieldName) {
                        await this.db.renameDeviceField(deviceId, newGroup.id, newField.id, newField.fieldName);
                    }
                    if (compareFields(newField, oldField) === false) {
                        await this.db.deleteDeviceField(deviceId, newGroup.id, newField.id);
                        await this.db.addDeviceField(deviceId, newGroup.id, newField);
                        //check is the trigger still valid
                    }
                }
            }
        }

        //////////////////////////////////////////////////////////////////////////
        let oldDeviceComplexGroups = device.deviceFieldComplexGroups;
        let newDeviceComplexGroups = deviceData.deviceFieldComplexGroups;

        for (let oldGroup of oldDeviceComplexGroups) {
            try {
                getComplexGroup(deviceData, oldGroup.id);
            } catch {
                await this.db.deleteComplexGroup(deviceId, oldGroup.id);
                //delete triggers for CG
                device = await this.getDevicebyId(deviceId);
            }
        }
        if (newDeviceComplexGroups) {
            for (let newGroup of newDeviceComplexGroups) {
                let oldGroup: IComplexFieldGroup;
                try {
                    oldGroup = getComplexGroup(device, newGroup.id);
                }
                catch {
                    await this.addComplexGroup(deviceId, newGroup.id, newGroup.groupName);
                    device = await this.getDevicebyId(deviceId);
                }

                oldGroup = getComplexGroup(device, newGroup.id);

                if (newGroup.groupName !== oldGroup.groupName) {
                    await this.db.renameComplexGroup(deviceId, newGroup.id, newGroup.groupName);
                }

                let oldComplexGroupStates = oldGroup.fieldGroupStates;
                let newComplexGroupStates = newGroup.fieldGroupStates;
                for (let oldState of oldComplexGroupStates) {
                    try {
                        getComplexGroupState(newGroup, oldState.id);
                    } catch {
                        await this.db.deleteComplexGroupState(deviceId, newGroup.id, oldState.id);
                        //delete triggers for CGS
                    }
                }

                for (let newState of newComplexGroupStates) {
                    let oldState: IComplexFieldGroupState;
                    try {
                        oldState = getComplexGroupState(oldGroup, newState.id);
                    }
                    catch {
                        await this.addComplexGroupState(deviceId, newGroup.id, newState.id, newState.stateName);
                        device = await this.getDevicebyId(deviceId);
                    }
                    oldState = getComplexGroupState(getComplexGroup(device, newGroup.id), newState.id);

                    if (newState.stateName !== oldState.stateName) {
                        await this.db.renameComplexGroupState(deviceId, newGroup.id, newState.id, newState.stateName);
                    }

                    let oldComplexGroupFields = oldState.fields;
                    let newComplexGroupFields = newState.fields;

                    for (let oldField of oldComplexGroupFields) {
                        try {
                            getFieldInComplexGroup(newState, oldField.id);
                        } catch {
                            await this.db.deleteFieldInComplexGroup(deviceId, newGroup.id, newState.id, oldField.id);
                            //delete triggers for F in CG
                        }
                    }

                    for (let newField of newComplexGroupFields) {
                        let oldField: IDeviceFieldBasic;
                        try {
                            oldField = getFieldInComplexGroup(oldState, newField.id);
                        }
                        catch {
                            await this.db.addFieldInComplexGroup(deviceId, newGroup.id, newState.id, newField);
                            device = await this.getDevicebyId(deviceId);
                        }
                        oldField = getFieldInComplexGroup(getComplexGroupState(getComplexGroup(device, newGroup.id), newState.id), newField.id);

                        if (newField.fieldName !== oldField.fieldName) {
                            await this.db.renameFieldInComplexGroup(deviceId, newGroup.id, newState.id, newField.id, newField.fieldName);
                        }

                        if (compareFields(newField, oldField) === false) {
                            await this.db.deleteFieldInComplexGroup(deviceId, newGroup.id, newState.id, newField.id);
                            await this.db.addFieldInComplexGroup(deviceId, newGroup.id, newState.id, newField);
                            //check is the trigger still valid
                        }
                    }
                }
            }
        }
    }

    async tryToChangeDeviceFieldValue(deviceId: number, groupId: number, field: IDeviceFieldBasic, fieldValue: any, dontSetValue?: boolean) {
        let oldValue: any;
        if (field.fieldType === 'button' && typeof fieldValue === 'boolean') {
            let buttonField = field.fieldValue as IDeviceFieldButton;
            oldValue = buttonField.fieldValue;
            if (!dontSetValue) {
                await this.db.changeDeviceFieldValue(deviceId, groupId, field.id, fieldValue);
            }
        }
        else if (field.fieldType === 'numeric' && typeof fieldValue === 'number') {
            let numField = field.fieldValue as IDeviceFieldNumeric;
            oldValue = numField.fieldValue;
            console.log('OLD VALUE: ' + oldValue);

            if (fieldValue <= numField.maxValue && fieldValue >= numField.minValue) {
                let N = (fieldValue - numField.minValue) / numField.valueStep;
                if (N % 1 < 0.05 || N % 1 > 0.95) {
                    if (!dontSetValue) {
                        await this.db.changeDeviceFieldValue(deviceId, groupId, field.id, fieldValue);
                    }
                }
                else throw ({ message: 'Incorrect step' });
            }
            else throw ({ message: 'Value out of interval [min,max]' });
        }
        else if (field.fieldType === 'text' && typeof fieldValue === 'string') {
            let textField = field.fieldValue as IDeviceFieldText;
            oldValue = textField.fieldValue;
            if (!dontSetValue) {
                await this.db.changeDeviceFieldValue(deviceId, groupId, field.id, fieldValue);
            }
        }
        else if (field.fieldType === 'multipleChoice' && typeof fieldValue === 'number') {
            let multipleCField = field.fieldValue as IDeviceFieldMultipleChoice;
            oldValue = multipleCField.fieldValue;
            if (multipleCField.values.length > fieldValue && fieldValue >= 0) {
                if (!dontSetValue) {
                    await this.db.changeDeviceFieldValue(deviceId, groupId, field.id, fieldValue);
                }
            }
            else throw ({ message: 'Out of range - MC field' });
        }
        else if (
            field.fieldType === 'RGB' &&
            ((!!fieldValue.R || fieldValue.R === 0) && typeof fieldValue.R === 'number' && fieldValue.R >= 0 && fieldValue.R < 256) &&
            ((!!fieldValue.G || fieldValue.G === 0) && typeof fieldValue.G === 'number' && fieldValue.G >= 0 && fieldValue.G < 256) &&
            ((!!fieldValue.B || fieldValue.B === 0) && typeof fieldValue.B === 'number' && fieldValue.B >= 0 && fieldValue.B < 256)
        ) {
            let rgbField = field.fieldValue as IDeviceFieldRGB;
            oldValue = {
                R: rgbField.R,
                G: rgbField.G,
                B: rgbField.B,
            };
            if (!dontSetValue) {
                await this.db.changeDeviceFieldValueRGB(deviceId, groupId, field.id, fieldValue);
            }
        }
        else {
            console.log('wrong');
            throw ({ message: 'Wrong field data type' });
        }
        return oldValue;
    }

    async tryToChangeComplexGroupState(device: IDevice, groupId: number, state: number) {
        let group = getComplexGroup(device, groupId);
        let NofStates = group.fieldGroupStates.length;
        if (state >= 0 && state < NofStates) {
            await this.db.changeComplexGroupState(device.id, groupId, state);
        }
        else throw ({ message: 'Invalid state number' });
    }

    async tryToChangeFieldValueInComplexGroup(deviceId: number, groupId: number, stateId: number, field: IDeviceFieldBasic, fieldValue: any, dontSetValue?: boolean): Promise<any> {
        let oldValue: any;
        if (field.fieldType === 'button' && typeof fieldValue === 'boolean') {
            let buttonField = field.fieldValue as IDeviceFieldButton;
            oldValue = buttonField.fieldValue;
            if (!dontSetValue) {
                await this.db.changeDeviceFieldValueInComplexGroup(deviceId, groupId, stateId, field.id, fieldValue);
            }
        }
        else if (field.fieldType === 'numeric' && typeof fieldValue === 'number') {
            let numField = field.fieldValue as IDeviceFieldNumeric;
            oldValue = numField.fieldValue;
            if (fieldValue <= numField.maxValue && fieldValue >= numField.minValue) {
                let N = (fieldValue - numField.minValue) / numField.valueStep;
                if (N % 1 < 0.05 || N % 1 > 0.95) {
                    if (!dontSetValue) {
                        await this.db.changeDeviceFieldValueInComplexGroup(deviceId, groupId, stateId, field.id, fieldValue);
                    }
                }
                else throw ({ message: 'Incorrect step' });
            }
            else throw ({ message: 'Value out of interval [min,max]' });

        }
        else if (field.fieldType === 'text' && typeof fieldValue === 'string') {
            let textField = field.fieldValue as IDeviceFieldText;
            oldValue = textField.fieldValue;
            if (!dontSetValue) {
                await this.db.changeDeviceFieldValueInComplexGroup(deviceId, groupId, stateId, field.id, fieldValue);
            }
        }
        else if (field.fieldType === 'multipleChoice' && typeof fieldValue === 'number') {
            let multipleCField = field.fieldValue as IDeviceFieldMultipleChoice;
            oldValue = multipleCField.fieldValue;
            if (multipleCField.values.length > fieldValue && fieldValue >= 0) {
                if (!dontSetValue) {
                    await this.db.changeDeviceFieldValueInComplexGroup(deviceId, groupId, stateId, field.id, fieldValue);
                }
            }
            else throw ({ message: 'Out of range - MC field' });
        }
        else if (
            field.fieldType === 'RGB' &&
            ((!!fieldValue.R || fieldValue.R === 0) && typeof fieldValue.R === 'number' && fieldValue.R >= 0) &&
            ((!!fieldValue.G || fieldValue.G === 0) && typeof fieldValue.G === 'number' && fieldValue.G >= 0) &&
            ((!!fieldValue.B || fieldValue.B === 0) && typeof fieldValue.B === 'number' && fieldValue.B >= 0)
        ) {
            let rgbField = field.fieldValue as IDeviceFieldRGB;
            oldValue = {
                R: rgbField.R,
                G: rgbField.G,
                B: rgbField.B,
            };
            if (!dontSetValue) {
                await this.db.changeDeviceFieldValueInComplexGroupRGB(deviceId, groupId, stateId, field.id, fieldValue);
            }
        }
        else {
            throw ({ message: 'Wrong field data type' });
        }
        return oldValue;
    }

    async getGroup(deviceId: number, groupId: number, device?: IDevice) {
        if (!device) {
            device = await this.db.getDevicebyId(deviceId);
        }
        let group = getDeviceFieldGroup(device, groupId);
        return group;
    }

    async getField(deviceId: number, groupId: number, fieldId: number, device?: IDevice): Promise<IDeviceFieldBasic> {
        let group = await this.getGroup(deviceId, groupId, device);
        let field = getDeviceField(group, fieldId);
        return field;
    }

    async getComplexGroup(deviceId: number, complexGroupId: number, device?: IDevice): Promise<IComplexFieldGroup> {
        if (!device) {
            device = await this.db.getDevicebyId(deviceId);
        }
        let complexGroup = getComplexGroup(device, complexGroupId);
        return complexGroup;
    }

    async getComplexGroupState(deviceId: number, groupId: number, stateId: number, device?: IDevice): Promise<IComplexFieldGroupState> {
        let group = await this.getComplexGroup(deviceId, groupId, device);
        let state = getComplexGroupState(group, stateId);
        return state;
    }

    async getFieldInComplexGroup(deviceId: number, groupId: number, stateId: number, fieldId: number, device?: IDevice): Promise<IDeviceFieldBasic> {
        let state = await this.getComplexGroupState(deviceId, groupId, stateId, device);
        let field = getFieldInComplexGroup(state, fieldId);
        return field;
    }

    async checkDoesGroupExist(deviceId: number, groupId: number, device?: IDevice): Promise<boolean> {
        try {
            await this.getGroup(deviceId, groupId, device);
        } catch {
            return false;
        }
        return true;
    }

    async checkDoesFieldExist(deviceId: number, groupId: number, fieldId: number, device?: IDevice): Promise<boolean> {
        try {
            await this.getField(deviceId, groupId, fieldId, device);
        } catch {
            return false;
        }
        return true;
    }

    async checkDoesComplexGroupExist(deviceId: number, complexGroupId: number, device?: IDevice): Promise<boolean> {
        try {
            await this.getComplexGroup(deviceId, complexGroupId, device);
        } catch {
            return false;
        }
        return true;
    }

    async checkDoesComplexGroupStateExist(deviceId: number, complexGroupId: number, stateId: number, device?: IDevice): Promise<boolean> {
        try {
            await this.getComplexGroupState(deviceId, complexGroupId, stateId, device);
        } catch {
            return false;
        }
        return true;
    }

    async checkDoesComplexGroupFieldExist(deviceId: number, complexGroupId: number, stateId: number, fieldId: number, device?: IDevice): Promise<boolean> {
        try {
            await this.getFieldInComplexGroup(deviceId, complexGroupId, stateId, fieldId, device);
        } catch {
            return false;
        }
        return true;
    }

    async deleteDeviceOnAllUsers(deviceId: number) {
        await bridge_deleteDeviceOnAllUsers(deviceId);
    }

    async deleteGroupOnAllUsers(deviceId: number, groupId: number) {
        await bridge_deleteGroupOnAllUsers(deviceId, groupId);
    }

    async deleteFieldOnAllUsers(deviceId: number, groupId: number, fieldId: number) {
        await bridge_deleteFieldOnAllUsers(deviceId, groupId, fieldId);
    }

    async deleteComplexGroupOnAllUsers(deviceId: number, complexGroupId: number) {
        await bridge_deleteComplexGroupOnAllUsers(deviceId, complexGroupId);
    }


}