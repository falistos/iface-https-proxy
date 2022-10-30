const https = require('https');
const loadbalancer = require('load-balancers');
const fs = require('fs');
const chalk = require('chalk');

const config = JSON.parse(fs.readFileSync('config.json'));
const balancer = new loadbalancer.P2cBalancer(config.interfaces.length);

console.log("Launching proxy...")

const interfaces = [];
for (let val of config.interfaces) {
    interfaces.push(new Interface(val));
}
console.log("Configured interfaces: ", interfaces)

const httpsServer = https.createServer(
    { key: fs.readFileSync(config.keyFile), cert: fs.readFileSync(config.certFile) },
    async function (req, res) {
        if (req.headers.host != config.hostname+":"+config.port) {
            console.log(chalk.bgRed(" "), "[", req.socket.remoteAddress, "]", "Rejected connection (wrong host:", req.headers.host,")");
            res.statusCode = 401;
            res.end();
            return;
        }

        let interface = interfaces[balancer.pick()];

        console.log(chalk.bgCyan(" "), "[", req.socket.remoteAddress, "=>", interface.address ,"]", "Handling", "-", req.url);

        let options = {
            hostname: config.upstreamServer,
            path: req.url,
            port: 443,
            localAddress: interface.address,
        };

        try {
            let rep = await sessionRequest(options);

            res.setHeader('Content-Type', 'text/json');
            res.statusCode = 200;
            res.end(rep);

            console.log(chalk.bgGreen(" "), "[", req.socket.remoteAddress, "=>", interface.address ,"]", "Success");
        } catch (err) {
            res.statusCode = err.statusCode != null ? err.statusCode : 400;
            res.end();

            console.log(chalk.bgRed(" "), "[", req.socket.remoteAddress, "=>", interface.address ,"]", "Error : ", err);
        }
    }).listen(config.port, config.bind, () => {
        console.log("Server running at http://${config.hostname}:${config.port}/");
    });

function sessionRequest(options) {
    return new Promise(function (resolve, reject) {
        var req = https.get(options, (res) => {
            if (res.statusCode != 200) {
                reject("Upstream API returned HTTP code", res.statusCode);
            }

            var body;
            res.on('data', function (chunk) {
                body = chunk;
            });

            res.on('end', function () {
                resolve(body);
            });

        }).on('error', (err) => {
            reject(err);
        });

        req.end();
    });
}

function Interface(address) {
    this.address = address;
}