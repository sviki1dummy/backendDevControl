// import * as BodyParser from 'body-parser';
import * as Express from 'express';
import { server as webSocketServer } from 'websocket';
import { v4 as uuid } from 'uuid';
let http = require('http');
let cors = require('cors');


export class Server {

    port = process.env.PORT || 8000;

    private app: Express.Application;
    private wsServer: webSocketServer;
    server: any;

    constructor() {
        this.app = Express();
        this.setConfig();
        this.setupRoutes();
        this.startServer();
        this.startInterval();
    }

    setConfig() {
        this.server = http.createServer(this.app);
        this.wsServer = new webSocketServer({
            httpServer: this.server,
        });

        var bodyParser = require('body-parser');

        this.app.use(bodyParser.urlencoded({ extended: true }));
        this.app.use(bodyParser.json());
        this.app.use(cors());
    }

    setupRoutes() {
        this.app.get('/dummy', (req: any, res: any) => {
            console.log('recived GET /dummy');
            res.send('Response from dummy1');
        });
    }

    startServer() {
        this.server.listen(this.port, () => {
            console.log('listening on port ' + this.port);
        });
    }


    https = require('https');
    startInterval() {
        let i = 0;
        let links: string[] = [];
        links.push('https://devcontrol-backend-proba1.onrender.com/dummmy');
//         links.push('https://dummyexpressapp1.onrender.com/dummy');
        links.push('https://dummyexpressapp2-ojgo.onrender.com/dummy');

        for (let i = 0; i < links.length; i++) {
            this.httpGet(links[i]);
        }

        let interval = (5 * 60 * 1000) / links.length;
        setInterval(async () => {
            i++;
            if (i >= links.length) i = 0;

            this.httpGet(links[i]);
        }, interval);
    }

    httpGet(link: string) {
        console.log(`link: ${link}`);
        this.https.get(link, (resp) => {
            let data = '';

            // A chunk of data has been received.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                console.log(`result from ${link}: ${data}`);
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    }
}
