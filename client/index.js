import makeElement from './makeElement.js';
import assign from './assign.mjs';

const setAttributes = (target, attributes) => {
	for (const attribute of Object.entries(attributes)) {
		target.setAttribute(...attribute);
	}
}

(async () => {
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

// 	// Parse format
// 	const formatTypes = {
// 		s32: [4, DataView.prototype.getInt32],
// 		u32: [4, DataView.prototype.getUint32],
// 		f32: [4, DataView.prototype.getFloat32],
// 		u16: [2, DataView.prototype.getUint16],
// 		u8: [1, DataView.prototype.getUint8],
// 		s8: [1, DataView.prototype.getInt8],
// 	};

// 	let format = await (await fetch('/format.txt')).text();
// 	format = format.toString().split(/\r?\n/);
// 	format = format.map(line => line.match(/([a-z]\d{1,2}) ([a-zA-Z]+);/));
// 	format = format.filter(match => match && match[2]);
// 	format = format.map(match => {
// 		const type = formatTypes[match[1]];
// 		const property = {
// 			key: match[2],
// 			byteLength: type[0],
// 			readFunction: type[1]
// 		};
// 		if (!property.readFunction) {
// 			throw new Error('Unknown type ' + match[1]);
// 		}
// 		return property;
// 	});

// 	const displayWidthHeight = Math.min(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio) + 'px';

	const canvasDefaultCursor = 'grab';
	const canvas = makeElement({
		parentElement: document.body,
		tagName: 'canvas',
		style: {
			position: 'fixed',
			width: '100%',
			height: '100%',
			cursor: canvasDefaultCursor
		}
	});
	const c = canvas.getContext('2d');

	const mapBlob = await (await fetch('/map.jpg')).blob();
	const mapBitmap = await createImageBitmap(mapBlob);
	const mapAspectRatio = mapBitmap.height / mapBitmap.width;

	const scaleMax = 10;
	let scaleMin = 0;
	let scale = 1;

	let lastCanvasWidth;
	let lastCanvasHeight;
	let canvasAspectRatioIsGreaterThanMapAspectRatio;

	let mapWidth;
	let mapHeight;
	let mapX;
	let mapXMin = -Infinity;
	let mapXMax = Infinity;
	let mapY;
	let mapYMin = -Infinity;
	let mapYMax = Infinity;
	let mouseX;
	let mouseY;

	let dragging = false;
	let dragStartMapX = null;
	let dragStartMapY = null;
	let dragStartMouseX = null;
	let dragStartMouseY = null;

	const updateMapXYLimits = () => {
		mapXMax = canvas.width / 2;
		mapXMin = canvas.width / 2 - mapWidth;
		mapYMax = canvas.height / 2;
		mapYMin = canvas.height / 2 - mapHeight;
	}

	const setMapXY = (x, y) => {
		mapX = Math.min(mapXMax, Math.max(mapXMin, x));
		mapY = Math.min(mapYMax, Math.max(mapYMin, y));
	};

	const setScale = (newScale, canvasScaleCenterX = canvas.width / 2, canvasScaleCenterY = canvas.height / 2) => {
		const lastScale = scale;
		scale = Math.min(scaleMax, Math.max(scaleMin, newScale));

		mapWidth = mapBitmap.width * scale;
		mapHeight = mapBitmap.height * scale;

		updateMapXYLimits();

		if (mapX === undefined || mapY === undefined) {
			mapX = (canvas.width - mapWidth) / 2;
			mapY = (canvas.height - mapHeight) / 2;
		} else {
			const relativeScale = scale / lastScale;
			const mapScaleCenterX = canvasScaleCenterX - mapX;
			const mapScaleCenterY = canvasScaleCenterY - mapY;
			setMapXY(
				mapX - ((mapScaleCenterX * relativeScale) - mapScaleCenterX),
				mapY - ((mapScaleCenterY * relativeScale) - mapScaleCenterY)
			)
		}
	};

	canvas.addEventListener('wheel', event => {
		setScale(scale * (event.deltaY < 0 ? 1.1 : 0.9), mouseX, mouseY);
	});
	canvas.addEventListener('mousedown', event => {
		if (event.button === 0) {
			dragging = true;
			dragStartMouseX = mouseX;
			dragStartMouseY = mouseY;
			dragStartMapX = mapX;
			dragStartMapY = mapY;
			canvas.style.cursor = 'grabbing';
		}
	});
	addEventListener('mousemove', event => {
		mouseX = event.clientX;
		mouseY = event.clientY;
		if (dragging) {
			setMapXY(
				dragStartMapX + (mouseX - dragStartMouseX),
				dragStartMapY + (mouseY - dragStartMouseY)
			);
		}
	});
	addEventListener('mouseup', event => {
		if (event.button === 0) {
			dragging = false;
			canvas.style.cursor = canvasDefaultCursor;
		}
	});

	const resize = () => {
		canvas.width = innerWidth * devicePixelRatio;
		canvas.height = innerHeight * devicePixelRatio;

		if (mouseX === undefined || mouseY === undefined) {
			mouseX = canvas.width / 2;
			mouseY = canvas.height / 2;
		}

		canvasAspectRatioIsGreaterThanMapAspectRatio = canvas.height / canvas.width > mapAspectRatio;
		scaleMin = (canvasAspectRatioIsGreaterThanMapAspectRatio ? canvas.width / mapBitmap.width : canvas.height / mapBitmap.height) / 2;

		const isLastCanvasWidthHeight = lastCanvasWidth && lastCanvasHeight;
		// scale and move width window resize
		if (isLastCanvasWidthHeight) {
			// scale
			const canvasMeanLength = (canvas.width + canvas.height) / 2;
			const lastCanvasMeanLength = (lastCanvasWidth + lastCanvasHeight) / 2;
			setScale(scale * canvasMeanLength / lastCanvasMeanLength);
		} else {
			setScale(scaleMin * 2);
		}

		updateMapXYLimits();

		if (isLastCanvasWidthHeight) {
			// and move
			setMapXY(
				mapX + ((canvas.width - lastCanvasWidth) / 2),
				mapY + ((canvas.height - lastCanvasHeight) / 2)
			);
		}

		lastCanvasWidth = canvas.width;
		lastCanvasHeight = canvas.height;
	}
	addEventListener('resize', resize);
	resize();

	let render = () => {
		c.clearRect(0, 0, canvas.width, canvas.height);
		c.drawImage(mapBitmap, mapX, mapY, mapWidth, mapHeight);
		requestAnimationFrame(render);
	};
	requestAnimationFrame(render);

// 	let lastPositionX = 0;
// 	let lastPositionZ = 0;

	const webSocketMesageHandler = async event => {
		// Parse Data
		const message = new DataView(await event.data.arrayBuffer());
		let i = 0;
		const playerId = message.getUint8(0);
		console.log(playerId);
// 		const data = {};
// 		let index = 0;
// 		for (const property of format) {
// 			if (property.key !== 'PADDING') {
// 				data[property.key] = property.readFunction.apply(dataView, [index, true]);
// 			}
// 			index += property.byteLength
// 		}

// 		const positionX = data.PositionX || lastPositionX;
// 		const positionZ = data.PositionZ || lastPositionZ;
// 		if (positionX === 0 && positionZ === 0) {
// 			return;
// 		}
// 		const mapLength  = 14850;
// 		const halfMapLength = mapLength / 2;
// 		const PositionXNormalized = ((data.PositionX || lastPositionX) + halfMapLength + 120) / mapLength;
// 		const PositionZNormalized = ((data.PositionZ || lastPositionZ) + halfMapLength + 1100) / mapLength;
// 		const canvasX = PositionXNormalized * canvasLength;
// 		const canvasY = (-PositionZNormalized + 1) * canvasLength
// 		if (data.PositionX !== 0 && data.PositionZ !== 0) {
// 			lastPositionX = data.PositionX;
// 			lastPositionZ = data.PositionZ;
// 		}
// 		c.clearRect(0, 0, c.canvas.width, c.canvas.height);

// 		c.beginPath();
// 		c.arc(canvasX, canvasY, 60, 0, Math.PI * 180)
// 		c.lineWidth = 50
// 		c.strokeStyle = `#000`;
// 		c.stroke();
		
// 		c.beginPath();
// 		c.arc(canvasX, canvasY, 60, 0, Math.PI * 180)
// 		c.lineWidth = 20
// 		c.strokeStyle = `hsl(${data.Hue / 254 * 360}, 100%, 50%)`;
// 		c.stroke();
		
// 		c.beginPath();
// 		c.arc(canvasX, canvasY, 10, 0, Math.PI * 180)
// 		c.lineWidth = 20
// 		c.fillStyle = `#fff`;
// 		c.fill();
	};

	// Connect webSocket and automatically reconnect on close
	const webSocketURL = new URL(location.origin);
	webSocketURL.protocol = 'ws';
	webSocketURL.pathname = 'data';
	while (true) {
		const webSocket = new WebSocket(webSocketURL);
		webSocket.addEventListener('message', webSocketMesageHandler);
		await new Promise(resolve => {
			webSocket.addEventListener('close', resolve);
		});
	}

})();