// +build !wasm-json

package main

import (
	"syscall/js"
)

func main() {
	js.Global().Set("setDB", js.FuncOf(setDB))
	js.Global().Set("getIp", js.FuncOf(getIp))
	js.Global().Set("ubb2html", js.FuncOf(ubb2htm))
	js.Global().Set("reg", js.FuncOf(reg))
	select {}
}

var db *Ip2Region

func setDB(this js.Value, args []js.Value) interface{} {
	if len(args) != 1 {
		panic("len(args) != 1")
	}
	array := args[0]
	inBuf := make([]uint8, array.Get("byteLength").Int())
	js.CopyBytesToGo(inBuf, array)
	db, err = New(inBuf)
	if err != nil {
		panic(err)
	}
	return js.ValueOf(true)
}

func getIp(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		panic("len(args) != 2")
	}
	ip := args[0].String()
	go func() {
		info, err := db.MemorySearch(ip)
		if err != nil {
			panic(err)
		}
		m := make(map[string]interface{})
		m["Country"] = info.Country
		m["Region"] = info.Region
		m["Province"] = info.Province
		m["City"] = info.City
		m["ISP"] = info.ISP
		m["string"] = info.String()
		args[1].Invoke(js.ValueOf(m))
	}()
	return js.ValueOf(nil)
}

func ubb2htm(this js.Value, args []js.Value) interface{} {
	if len(args) != 1 {
		panic("len(args) != 1")
	}
	return js.ValueOf(ubb2html(args[0].String()))
}
