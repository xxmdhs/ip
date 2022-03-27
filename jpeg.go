package main

import (
	"fmt"
	"syscall/js"

	"github.com/liut/jpegquality"
)

func getQuality(b []byte) (int, error) {
	q, err := jpegquality.NewWithBytes(b)
	if err != nil {
		return 0, fmt.Errorf("getQuality: %w", err)
	}
	return q.Quality(), nil
}

func getQualityJs(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		panic("len(args) < 1")
	}
	buffer := make([]byte, args[0].Length())
	js.CopyBytesToGo(buffer, args[0])
	q, err := getQuality(buffer)
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	return q
}
