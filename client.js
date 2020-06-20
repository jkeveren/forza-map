import makeElement from './makeElement.js';
import assign from './assign.mjs';

const setAttributes = (target, attributes) => {
	for (const attribute of Object.entries(attributes)) {
		target.setAttribute(...attribute);
	}
}

(async () => {
	const formatTypes = {
		s32: [4, DataView.prototype.getInt32],
		u32: [4, DataView.prototype.getUint32],
		f32: [4, DataView.prototype.getFloat32],
		u16: [2, DataView.prototype.getUint16],
		u8: [1, DataView.prototype.getUint8],
		s8: [1, DataView.prototype.getInt8],
	};

	let format = await (await fetch('/format.txt')).text();
	format = format.toString().split(/\r?\n/);
	format = format.map(line => line.match(/([a-z]\d{1,2}) ([a-zA-Z]+);/));
	format = format.filter(match => match && match[2]);
	format = format.map(match => {
		const type = formatTypes[match[1]];
		const property = {
			key: match[2],
			byteLength: type[0],
			readFunction: type[1]
		};
		if (!property.readFunction) {
			throw new Error('Unknown type ' + match[1]);
		}
		return property;
	});

	makeElement({
		parentElement: document.head,
		tagName: 'style'
	});
	document.styleSheets[0].insertRule(`* {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
		font-family: monospace;
	}`);

	assign(document.body.style, {
		background: '#000',
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center'
	});

	const displayWidthHeight = Math.min(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio) + 'px';

	const image = makeElement({
		parentElement: document.body,
		tagName: 'img',
		src: '/map.jpg',
		style: {
			width: displayWidthHeight,
			heigth: displayWidthHeight
		}
	});

	const canvas = makeElement({
		parentElement: document.body,
		tagName: 'canvas',
		style: {
			position: 'absolute',
			width: displayWidthHeight,
			heigth: displayWidthHeight
		}
	});
	const c = canvas.getContext('2d');

	await new Promise(resolve => {
		image.addEventListener('load', resolve);
	});
	const canvasLength = image.naturalWidth;
	canvas.width = canvas.height = canvasLength;

	let lastPositionX = 0;
	let lastPositionZ = 0;
	while (true) {
		let reader = null;
		let open = true;
		try {
			const response = await fetch('/data');
			reader = response.body.getReader();
			(async () => {
				await reader.closed;
				console.log('closed');
				open = false;
			})();
			while (open) {
				const chunk = await reader.read();
				if (chunk.done) {
					continue;
				}
				const dataView = new DataView(chunk.value.buffer);
				const data = {};
				let index = 0;
				for (const property of format) {
					if (property.key !== 'PADDING') {
						data[property.key] = property.readFunction.apply(dataView, [index, true]);
					}
					index += property.byteLength
				}
				console.log(data.PositionX, data.PositionZ);
				const mapLength  = 14850;
				const halfMapLength = mapLength / 2;
				const PositionXNormalized = ((data.PositionX || lastPositionX) + halfMapLength + 120) / mapLength;
				const PositionZNormalized = ((data.PositionZ || lastPositionZ) + halfMapLength + 1100) / mapLength;
				const canvasX = PositionXNormalized * canvasLength;
				const canvasY = (-PositionZNormalized + 1) * canvasLength
				if (data.PositionX !== 0 && data.PositionZ !== 0) {
					lastPositionX = data.PositionX;
					lastPositionZ = data.PositionZ;
				}
				c.beginPath();
				c.clearRect(0, 0, c.canvas.width, c.canvas.height);
				c.arc(canvasX, canvasY, 20, 0, Math.PI * 180)
				c.strokeStyle = '#000';
				c.lineWidth = 20
				c.stroke();
				c.fillStyle = '#ff0';
				c.fill();
			}
		} catch (error) {
			console.error(error);
			if (open = true) {
				reader.cancel();
				open = false;
			}
		}
		// wait before trying to reconnect
		await new Promise(resolve => setTimeout(resolve, 100));
	}

})();