package main

import (
	"strings"
	"syscall/js"

	"github.com/lionsoul2014/ip2region/binding/golang/xdb"
)

func main() {
	js.Global().Set("setDB", js.FuncOf(setDB))
	js.Global().Set("getIp", js.FuncOf(getIp))
	js.Global().Set("ubb2html", js.FuncOf(ubb2htm))
	js.Global().Set("reg", js.FuncOf(reg))
	js.Global().Set("conver", js.FuncOf(con))
	js.Global().Set("bil2dp", js.FuncOf(bil2dpw))
	js.Global().Set("sign", js.FuncOf(sign))
	js.Global().Set("verify", js.FuncOf(verify))
	js.Global().Set("genkey", js.FuncOf(genKeyJs))
	js.Global().Set("guzip", js.FuncOf(gbk2UtfZipJs))
	js.Global().Set("getquality", js.FuncOf(getQualityJs))
	select {}
}

var db *xdb.Searcher

func setDB(this js.Value, args []js.Value) interface{} {
	if len(args) != 1 {
		panic("len(args) != 1")
	}
	array := args[0]
	inBuf := make([]uint8, array.Get("byteLength").Int())
	js.CopyBytesToGo(inBuf, array)

	var err error
	db, err = xdb.NewWithBuffer(inBuf)
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
		str, err := db.SearchByStr(ip)
		if err != nil {
			panic(err)
		}
		info := Str2IpInfo(str)
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

type IpInfo struct {
	Country  string
	Region   string
	Province string
	City     string
	ISP      string
}

func Str2IpInfo(str string) IpInfo {
	s := strings.Split(str, "|")
	return IpInfo{
		Country:  s[0],
		Region:   s[1],
		Province: s[2],
		City:     s[3],
		ISP:      s[4],
	}
}

func (ip IpInfo) String() string {
	return ip.Country + "|" + ip.Region + "|" + ip.Province + "|" + ip.City + "|" + ip.ISP
}
