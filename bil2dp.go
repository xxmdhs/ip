package main

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"strconv"
	"strings"
	"syscall/js"
)

func bil2dp(b []byte) ([]byte, error) {
	v := Result{}
	err := xml.Unmarshal(b, &v)
	if err != nil {
		return nil, fmt.Errorf("bil2dp: %w", err)
	}
	d := dplayer{Code: 0}
	d.Data = make([]interface{}, 0, len(v.D))

	for _, v := range v.D {
		l := make([]interface{}, 5)
		list := strings.Split(v.P, ",")
		f, err := strconv.ParseFloat(list[0], 64)
		if err != nil {
			return nil, fmt.Errorf("bil2dp: %w", err)
		}
		l[0] = f
		t, err := strconv.Atoi(list[1])
		if err != nil {
			return nil, fmt.Errorf("bil2dp: %w", err)
		}
		switch t {
		case 1, 2, 3:
			l[1] = 0
		case 4:
			l[1] = 2
		case 5:
			l[1] = 1
		default:
			continue
		}
		f, err = strconv.ParseFloat(list[3], 64)
		if err != nil {
			return nil, fmt.Errorf("bil2dp: %w", err)
		}
		l[2] = f
		l[3] = list[6]
		l[4] = v.Value
		d.Data = append(d.Data, l)
	}
	b, err = json.Marshal(d)
	if err != nil {
		return nil, fmt.Errorf("bil2dp: %w", err)
	}
	return b, nil
}

type d struct {
	P     string `xml:"p,attr"`
	Value string `xml:",chardata"`
}
type Result struct {
	XMLName xml.Name `xml:"i"`
	D       []d      `xml:"d"`
	Chatid  string   `xml:"chatid"`
}

type dplayer struct {
	Code int           `json:"code"`
	Data []interface{} `json:"data"`
}

/*
[
    0, // 时间, 单位：s
    0|1|2, // 弹幕类型： rolling 0 top 1 bottom 2
    15024726, // 十进制颜色
    'username',
    'text'
]

https://github.com/DIYgod/DPlayer/issues/1217#issuecomment-933281691
*/

// https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/video/info.md
// https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/danmaku/danmaku_xml.md

func bil2dpw(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		panic("len(args) < 1")
	}
	b, err := bil2dp([]byte(args[0].String()))
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	return js.ValueOf(string(b))
}
