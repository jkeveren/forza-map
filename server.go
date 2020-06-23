package main

import (
	"container/list"
	"encoding/binary"
	"golang.org/x/net/websocket"
	"log"
	"math"
	"math/rand"
	"net"
	"net/http"
	"time"
)

const UDPMessageLength = 324
const websocketMessageLength = UDPMessageLength + 1
const timeIdTolerance = 1000

type Player struct {
	timeId          int64
	lastTimestampMS uint32
	hue             byte // between 0 and 254 because Forza Horizon 4 steer value only supports 255 values
}

func main() {
	players := list.New()
	clients := list.New()

	// Receive UDP messages from Forza Horizon 4
	go func() {
		UDPAddr := net.UDPAddr{
			IP:   net.IP{127, 0, 0, 1},
			Port: 50000,
		}
		connection, err := net.ListenUDP("udp", &UDPAddr)
		defer connection.Close()
		if err != nil {
			log.Panic(err)
		}
		buffer := make([]byte, websocketMessageLength) // buffer is used for receiving UDP and sending websocket messages
		for {
			length, _, _ := connection.ReadFromUDP(buffer)
			if length != UDPMessageLength {
				continue
			}
			timestampMS := binary.LittleEndian.Uint32(buffer[4:8])
			unixMS := time.Now().UnixNano() / int64(time.Millisecond)
			timeId := unixMS - int64(timestampMS)
			newPlayer := true
			var player *Player
			// Identify or create new player
			for e := players.Front(); e != nil; e = e.Next() {
				slicePlayer := e.Value.(*Player)
				if slicePlayer.timeId < timeId+timeIdTolerance && slicePlayer.timeId > timeId-timeIdTolerance {
					player = slicePlayer
					newPlayer = false
					break
				}
			}
			if newPlayer {
				p := Player{
					timeId: timeId,
					hue:    byte(rand.Intn(254)),
				}
				player = &p
				players.PushBack(player)
			} else if buffer[0] == 0 || timestampMS < player.lastTimestampMS {
				// ignore old data
				continue
			}
			// Change color based on steer value if
			if buffer[315] == math.MaxUint8 &&
				buffer[316] == math.MaxUint8 &&
				buffer[318] == math.MaxUint8 {
				steer := buffer[320] // between 129 to 255 for left and 0 to 127 for right. This is not an error.
				// translate steer to hue by flipping and joining left and right values so hue is 0 to 254
				if steer > 128 {
					player.hue = steer - 128 - 1 // subtract 1 to account for the absence of 128 in the possible steer values
				} else if steer <= 128 {
					player.hue = steer + 128 - 1
				}
			}
			buffer[UDPMessageLength-1] = player.hue
			// Send data to clients
			for e := clients.Front(); e != nil; e = e.Next() {
				client := e.Value.(*websocket.Conn)
				websocket.Message.Send(client, buffer)
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
	http.Handle("/", http.FileServer(http.Dir("client")))
	// http.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
	// 	fmt.Println("return")
	// })
	log.Fatal(http.ListenAndServe(":50000", nil))
}
