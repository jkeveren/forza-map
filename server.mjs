import dgram from 'dgram';
import {promises as fs} from 'fs';
import http from 'http';
import url from 'url';
import path from 'path';

const HTTPPort = 50000;
const UDPPort = 50000;

(async () => {
	process.title = 'Forza Horizon 4 Data Readout Server';

	const directory = path.dirname(url.fileURLToPath(import.meta.url));

	let streams = new Set();

	const HTTPServer = http.createServer();

	HTTPServer.on('request', async (request, response) => {
		try {
			const origin = request.headers.origin || 'http://' + request.headers.host || 'http://localhost:' + HTTPPort;
			const requestURL = new url.URL(request.url, origin);
			console.log(request.socket.remoteAddress, ' -> ', requestURL.href);
			if (requestURL.pathname === '/data') {
				streams.add(response);
				response.on('close', () => {
					streams.delete(response);
				});
				console.log(streams.size);
				return;
			} else if (requestURL.pathname === '/') {
				response.setHeader('content-type', 'text/html');
				response.write('<script src=client.js type=module></script>');
			} else {
				try {
					const content = await fs.readFile(path.join(directory, '.' + request.url));
					const match = requestURL.pathname.match(/\.(?<extension>\w+)$/);
					if (match && ['mjs', 'js'].includes(match.groups.extension)) {
						response.setHeader('content-type', 'application/javascript');
					}
					response.write(content);
				} catch (error) {
					if (['ENOENT', 'EISDIR'].includes(error.code)) {
						response.statusCode = 404;
					} else {
						throw error;
					}
				}
			}
		} catch (error) {
			response.statusCode = 500;
			console.error(error);
		}
		response.end();
	});

	HTTPServer.listen(HTTPPort, () => {
		console.log('HTTP Server listening on port ' + HTTPPort);
	});

	const dgramServer = dgram.createSocket('udp4');

	dgramServer.on('error', error => {
		console.error(error);
	});

	dgramServer.on('message', (message, rinfo) => {
		try {
			if (message.length !== 324) {
				throw new Error('Datagram message has invalid length: ' + message.length);
			}
			for (const stream of streams) {
				stream.write(message);
			}
		} catch (error) {
			console.error(error);
		}
	});

	dgramServer.on('listening', () => {
		const address = dgramServer.address();
		console.log('Forza Horizon 4 Data Server listening on UDP port ' + address.port);
	});

	dgramServer.bind(UDPPort);
})();
