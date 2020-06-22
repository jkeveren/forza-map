package main

import (
	"container/list"
	"encoding/binary"
	"golang.org/x/net/websocket"
	"log"
	"math"
	"net"
	"net/http"
	"time"
)

const UDPMessageLength = 324
const timeIdTolerance = 1000

type Player struct {
	timeId          int64
	lastTimestampMS uint32
	hue             byte
}

func main() {
	players := list.New()
	clients := list.New()

	// Receive UDP messages from Forza Horizon 4
	go func() {
		connection, err := net.ListenUDP("udp", &net.UDPAddr{IP: net.IP{127, 0, 0, 1}, Port: 50000})
		defer connection.Close()
		if err != nil {
			log.Panic(err)
		}
		buffer := make([]byte, UDPMessageLength)
		for {
			length, _, _ := connection.ReadFromUDP(buffer)
			if length != UDPMessageLength {
				continue
			}
			timestampMS := binary.LittleEndian.Uint32(buffer[4:8])
			unixMS := time.Now().UnixNano() / int64(time.Millisecond)
			timeId := unixMS - int64(timestampMS)
			newPlayer := true
			var player Player
			// Identify or create new player
			for e := players.Front(); e != nil; e = e.Next() {
				slicePlayer := e.Value.(Player)
				if slicePlayer.timeId < timeId+timeIdTolerance && slicePlayer.timeId > timeId-timeIdTolerance {
					player = slicePlayer
					newPlayer = false
					break
				}
			}
			if newPlayer {
				player = Player{
					timeId: timeId,
				}
				players.PushBack(player)
			} else if buffer[0] == 0 || timestampMS < player.lastTimestampMS {
				// ignore old data
				continue
			}
			if buffer[315] == math.MaxUint8 &&
				buffer[316] == math.MaxUint8 &&
				buffer[318] == math.MaxUint8 {
				steer := buffer[320]
				if steer > 128 {
					player.hue = steer - 128
				} else if steer < 128 {
					player.hue = steer + 128
				}
				log.Print(steer, player.hue)
			}
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
