import makeElement from './makeElement.js';
import assign from './assign.mjs';
import Player from './player.js';

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

	const mapGameWidth = 14825;
	const mapGameHeight = mapGameWidth;
	const halfMapGameWidth = mapGameWidth / 2;
	const halfMapGameHeight = mapGameHeight / 2;
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

	const players = new Set();

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

		for (const player of players) {
			if (!player.raceHasBeenOn) {
				continue;
			}
			const x = mapX + player.normalizedX * mapWidth;
			const y = mapY + (-player.normalizedZ + 1) * mapHeight;

			const canvasScale = 15;

			c.translate(x, y);
			c.scale(canvasScale, canvasScale);
			c.rotate(player.yaw);

			c.beginPath();
			c.moveTo(0, -1);
			c.lineTo(-0.8, 1);
			c.lineTo(0, 0.5);
			c.lineTo(0.8, 1);
			c.closePath();
			
			c.strokeStyle = '#000';
			c.lineWidth = 0.5;
			c.lineJoin = 'round';
			c.stroke();
			
			c.fillStyle = player.color;
			c.fill();
			
			c.resetTransform();
		}

		requestAnimationFrame(render);
	};
	requestAnimationFrame(render);

	const webSocketMesageHandler = async event => {
		const message = new DataView(await event.data.arrayBuffer());

		let i = 0;
		const id = message.getUint32(i, true);
		i += 4;

		// Identify or create player
		let player;
		for (const p of players) {
			if (p.id === id) {
				player = p;
			}
		}
		if (!player) {
			player = new Player(id);
			players.add(player);
		}

		player.isRaceOn = message.getInt32(i, true);
		i += 4;
		if (!player.isRaceOn) {
			return;
		}
		player.raceHasBeenOn = true
		const gameX = message.getFloat32(i, true);
		i += 4;
		const gameY = message.getFloat32(i, true);
		player.altitude = gameY - 100;
		i += 4;
		const gameZ = message.getFloat32(i, true);
		i += 4;
		player.yaw = message.getFloat32(i, true);
		i += 4;
		player.speed = message.getFloat32(i, true);
		i += 4;
		const hue = message.getUint8(i);
		player.color = `hsl(${hue / 254 * 360}, 100%, 50%)`;
		i++;

		player.normalizedX = (gameX + halfMapGameWidth + 115) / mapGameWidth;
		player.normalizedZ = (gameZ + halfMapGameHeight + 1115) / mapGameHeight;
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
