import { IEmailConfirmationData, IForgotPasswordData } from "../emailService/emailModels";
import { EmailService, emailServiceSingletonFactory } from "../emailService/emailService";
import { Db } from "firestoreDB/db";
import { DBSingletonFactory } from "../firestoreDB/singletonService";
import { ISOToUNIX, getCurrentTimeISO, getCurrentTimeUNIX, hasTimePASSED } from "../generalStuff/timeHandlers";
import { ILoginResponse } from "models/API/loginRegisterReqRes";
import { IAuthToken, IUser } from "models/basicModels";
import { v4 as uuidv4 } from 'uuid';

export class UserService {

    private db: Db;
    private emailService: EmailService

    constructor() {
        this.db = DBSingletonFactory.getInstance();
        this.emailService = emailServiceSingletonFactory.getInstance();
    }

    async getUserbyId(id: number): Promise<IUser> {
        return await this.db.getUserbyId(id);
    }

    async getUsers(): Promise<IUser[]> {
        return await this.db.getUsers();
    }

    async loginUserByCreds(username: string, password: string, firebaseToken?: string): Promise<ILoginResponse> {
        var users = await this.db.getUsers();
        const user = users.find(user => user.username === username);
        if (!user) {
            throw ({ message: 'User doesn\'t exist' });
        }
        if (user.password !== password) {
            throw ({ message: 'Wrong password' });
        }

        let tokenData = await this.db.generateAndSaveNewToken(user.id, firebaseToken)

        let loginResponse: ILoginResponse = {
            authToken: tokenData.authToken,
            id: user.id,
            username: user.username,
            email: user.email
        };

        return loginResponse;
    }

    async getUserByToken(token: string, updateTokenTime: boolean): Promise<IUser> {
        let authTokenDB: IAuthToken = await this.db.getToken(token);

        if (!authTokenDB) {
            throw ({ message: 'Couldn\'t find token' });
        }
        if (hasTimePASSED(authTokenDB.validUntil)) {
            throw ({ message: 'Token expired' });
        }
        const user = await this.db.getUserbyId(authTokenDB.userId);
        if (!user) {
            throw ({ message: 'User doesn\'t exist' });
        }

        if (updateTokenTime) {
            await this.db.extendToken(token);
        }
        return user;
    }

    async removeAllMyTokens(dontRemoveToken: string) {
        await this.db.removeAllMyTokens(dontRemoveToken);
    }

    async removeToken(token: string): Promise<void> {
        await this.db.removeToken(token);
    }

    async getUserbyEmail(email: string): Promise<IUser> {
        let users: IUser[] = await this.db.getUsers();
        let user = users.find(user => user.email === email);
        if (!user) throw ({ message: 'User doesn\'t exist' });
        return user;
    }

    async getUserbyName(username: string): Promise<IUser> {
        let users: IUser[] = await this.db.getUsers();
        let user = users.find(user => user.username === username);
        if (!user) throw ({ message: 'User doesn\'t exist' });
        return user;
    }

    async changeUserPassword(id: number, oldP: string, newP: string) { //TODO remove this
        let user = await this.db.getUserbyId(id);
        if (user.password !== oldP) {
            throw ({ message: 'Wrong password' });
        }
        await this.db.updateUserPassword(id, newP);
    }

    async addUser(username: string, password: string, email: string): Promise<number> {
        var users = await this.db.getUsers();
        var sameNameUser = users.find(user => user.username === username);
        if (sameNameUser) throw ({ message: 'User with same name exists' });

        if (email) {
            let sameEmailUser = users.find(user => user.email === email);
            console.log(sameEmailUser);
            if (sameEmailUser) throw ({ message: 'User with same email exists' });
        }
        var maxIDdoc = await this.db.getMaxUserId(true);

        var newUser: IUser = {
            id: maxIDdoc + 1,
            password: password,
            username: username,
            email: '',
            userRight: { rightsToDevices: [], rightsToGroups: [], rightsToFields: [], rightsToComplexGroups: [] },
            fieldViews: [],
        }

        if (email !== "") {
            await this.sendEmailConfirmation_registration(newUser.id, newUser.username, email);
        }

        await this.db.addUser(newUser);
        return newUser.id;
    }

    async deleteUser(token: string) {
        let user = await this.getUserByToken(token, false);
        if (!user) {
            throw ({ message: 'User doesn\'t exist in database' });
        }
        await this.db.deleteUser(user.id);
        //TODO delete forgot password requests and others
    }

    async sendEmailConfirmation_registration(id: number, username: String, email: string) {
        let hashCode = uuidv4();
        await this.emailService.sendRegistrationEmail(username, email, hashCode);

        let emailConfirmationData: IEmailConfirmationData = {
            userId: id,
            hashCode: hashCode,
            email: email,
        }
        await this.db.saveEmailConfirmationData(emailConfirmationData);
    }

    async sendEmailConfirmation_addEmail(id: number, username: String, email: string) {
        let hashCode = uuidv4();
        await this.emailService.sendAddEmailEmail(username, email, hashCode);

        let emailConfirmationData: IEmailConfirmationData = {
            userId: id,
            hashCode: hashCode,
            email: email,
        }
        let confirmations = await this.db.getAllEmailConfirmationData();
        for (let confirmation of confirmations) {
            if (confirmation.email === email)
                await this.db.deleteEmailConfirmationData(confirmation.hashCode);
        }
        await this.db.saveEmailConfirmationData(emailConfirmationData);
    }

    async getEmailConfirmationData(hashCode: string): Promise<IEmailConfirmationData> {
        let data: IEmailConfirmationData[] = await this.db.getAllEmailConfirmationData();
        let findCode = data.find(o => o.hashCode === hashCode);
        if (findCode) return findCode;
        throw { message: 'Can\'t find email confirmation' };
    }

    async confirmEmail(hashCode: string) {
        let data: IEmailConfirmationData[] = await this.db.getAllEmailConfirmationData();

        let emailConfirmation = data.find(o => o.hashCode === hashCode);
        if (emailConfirmation) {

            let users = await this.db.getUsers();
            let sameEmailUser = users.find(user => user.email === emailConfirmation?.email);
            if (sameEmailUser) throw ({ message: 'Email was already confirmed for a different user' });

            if (await this.db.getUserbyId(emailConfirmation.userId)) {
                await this.db.updateUserEmail(emailConfirmation.userId, emailConfirmation.email);
                await this.db.deleteEmailConfirmationData(emailConfirmation.hashCode);

                for (let confirmation of data) {
                    if (confirmation.email === emailConfirmation.email) {
                        await this.db.deleteEmailConfirmationData(confirmation.hashCode);
                    }
                }
            }
            else {
                throw ({ message: 'User doesn\'t exist' });
            }
        }
        else {
            throw ({ message: 'Invalid email confirmation code' });
        }
    }

    async createForgotPasswordRequest(userId: number, username: string, email: string) {
        let request: IForgotPasswordData = {
            userId: userId,
            hashCode: uuidv4(),
            timeStamp: getCurrentTimeISO(),
        }
        await this.emailService.sendForgotPasswordEmail(username, email, request.hashCode);
        await this.db.saveForgotPasswordRequest(request);
    }

    async getForgotPasswordRequest(hashCode: string): Promise<IForgotPasswordData> {
        let datas: IForgotPasswordData[] = await this.db.getAllForgotPasswordRequests();
        let data = datas.find(o => o.hashCode === hashCode);
        if (data == null) {
            throw ({ message: 'Can\'t find it' });
        }
        return data;
    }

    async changePasswordViaForgetPasswordRequest(hashCode: string, newPassword: string) {
        let reqs: IForgotPasswordData[] = await this.db.getAllForgotPasswordRequests();
        let req = reqs.find(o => o.hashCode === hashCode);
        if (req == null) {
            throw ({ message: "Can't find the change password request" });
        }

        console.log(getCurrentTimeUNIX());

        if (getCurrentTimeUNIX() - ISOToUNIX(req.timeStamp) > 1000 * 60 * 15) { //15 minutes
            console.log('no timeeee');

            throw ({ message: "Expired" });
        }

        await this.db.updateUserPassword(req.userId, newPassword);
        await this.db.deleteForgotPasswordRequest(req.userId);
    }

    async getUsersFirebaseTokens(userId: number):Promise<string[]> {
        let tokens = await this.db.getTokens();
        let myTokens: string[] = [];
        for (let token of tokens) {
            if (token.firebaseToken != null && token.userId === userId) {
                myTokens.push(token.firebaseToken);
            }
        }
        return myTokens;
    }
}