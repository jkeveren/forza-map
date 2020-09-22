package main

import (
	"container/list"
	"encoding/binary"
	"fmt"
	"golang.org/x/net/websocket"
	"math"
	"math/rand"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"
)

const UDPMessageLength = 324
const timeIdTolerance = 100

type Player struct {
	id                     uint32
	timeId                 uint64
	latestMessageUnixMilli uint64
	lastTimestampMS        uint32
	hue                    byte // between 0 and 254 because Forza Horizon 4 steer value only supports 255 values
	expiryTimer            *time.Timer
}

func main() {
	players := list.New()
	clients := list.New()

	rand.Seed(time.Now().UnixNano())

	portString := os.Getenv("PORT")
	if portString == "" {
		portString = "42069"
	}

	port, err := strconv.Atoi(portString)
	if err != nil {
		fmt.Println("PORT environment variable is not a number")
		os.Exit(1)
	}

	// Receive UDP messages from Forza Horizon 4 and send to clients
	go func() {
		UDPAddr := net.UDPAddr{Port: port}

		connection, err := net.ListenUDP("udp", &UDPAddr)
		defer connection.Close()
		if err != nil {
			panic(err)
		}
		fmt.Println("Listening for UDP on port " + portString)

		UDPMessage := make([]byte, UDPMessageLength)
		websocketMessage := make([]byte, 29)

		mapValues, i := makeValueMapper(&websocketMessage, &UDPMessage)

		for {
			length, _, err := connection.ReadFromUDP(UDPMessage)
			if length != UDPMessageLength || err != nil {
				continue
			}

			unixMilli := getUnixMilli()
			timestampMS := binary.LittleEndian.Uint32(UDPMessage[4:8])
			timeId := uint64(unixMilli) - uint64(timestampMS)
			var player *Player
			var playerElement *list.Element

			// Identify or create player
			foundPlayer := false
			for e := players.Front(); e != nil; e = e.Next() {
				slicePlayer := e.Value.(*Player)
				if slicePlayer.timeId < timeId+timeIdTolerance &&
					slicePlayer.timeId > timeId-timeIdTolerance {
					player = slicePlayer
					playerElement = e
					foundPlayer = true
					break
				}
			}
			if !foundPlayer {
				var id uint32
				for e := players.Front(); e != nil && e.Value.(*Player).id == id; e = e.Next() {
					id++
				}
				newPlayer := Player{
					id:          id,
					timeId:      timeId,
					hue:         byte(rand.Intn(254)),
					expiryTimer: nil,
				}
				player = &newPlayer
				playerElement = players.PushBack(player)
			} else if timestampMS < player.lastTimestampMS {
				// ignore out of order messages
				continue
			}

			if player.expiryTimer != nil {
				player.expiryTimer.Stop()
			}
			player.expiryTimer = time.AfterFunc(5*time.Second, func() {
				players.Remove(playerElement)
			})

			player.latestMessageUnixMilli = unixMilli

			// Change player hue
			if UDPMessage[315] == math.MaxUint8 /* Accelerator */ &&
				UDPMessage[316] == math.MaxUint8 /* Brake */ &&
				UDPMessage[318] == math.MaxUint8 /* Handbrake */ {
				// translate steer to hue by flipping and joining left and right values so hue is 0 to 254 (not 255 due to absence of 128 in possible steer values).
				steer := UDPMessage[320]
				if steer > 128 {
					player.hue = steer - 129 // steer is between 129 to 255 for left and 0 to 127 for right. Seems weird but it's correct.
				} else {
					player.hue = steer + 127
				}
			}

			// Map UDPMessage to websocketMessage
			*i = 0
			binary.LittleEndian.PutUint32(websocketMessage, player.id) // id
			*i += 4
			mapValues(0, 4)                   // IsRaceOn
			mapValues(244, 4)                 // positionX
			mapValues(248, 4)                 // positionY
			mapValues(252, 4)                 // positionZ
			mapValues(56, 4)                  // yaw
			mapValues(256, 4)                 // speed
			websocketMessage[*i] = player.hue // hue
			*i++

			// Send data to clients
			for e := clients.Front(); e != nil; e = e.Next() {
				client := e.Value.(*websocket.Conn)
				websocket.Message.Send(client, websocketMessage)
			}
			player.lastTimestampMS = timestampMS
		}
	}()

	// Manage client connections
	http.Handle("/data", websocket.Handler(func(connection *websocket.Conn) {
		defer connection.Close()
		element := clients.PushBack(connection)
		message := make([]byte, 0)
		for {
			// err indicates connection close
			err := websocket.Message.Receive(connection, &message)
			if err != nil {
				break
			}
		}
		clients.Remove(element)
	}))

	// Serve client
	http.Handle("/", http.FileServer(http.Dir("./client")))
	fmt.Println("Starting HTTP server on port " + portString)
	panic(http.ListenAndServe(":"+portString, nil))
}

func getUnixMilli() uint64 {
	return uint64(time.Now().UnixNano()) / uint64(time.Millisecond)
}

func makeValueMapper(target, source *[]byte) (func(int, int), *int) {
	targetIndex := 0
	mapValues := func(sourceIndex, length int) {
		for i := 0; i < length; i++ {
			(*target)[targetIndex] = (*source)[sourceIndex]
			targetIndex++
			sourceIndex++
		}
	}
	return mapValues, &targetIndex
}
