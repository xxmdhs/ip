package main

import (
	"encoding/json"
	"syscall/js"

	"github.com/xxmdhs/ip/conver"
)

func con(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		panic("len(args) < 1")
	}
	l, err := conver.ToMlab([]byte(args[0].String()))
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	b, err := json.Marshal(l)
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	return js.ValueOf(string(b))
}
