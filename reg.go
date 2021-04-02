package main

import (
	"regexp"
	"syscall/js"
)

func reg(this js.Value, args []js.Value) interface{} {
	if len(args) != 3 {
		panic("len(args) != 1")
	}
	reg, err := regexp.Compile(args[0].String())
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	ls := []string{}
	if !args[2].Bool() {
		ls = reg.FindStringSubmatch(args[1].String())
	} else {
		l := reg.FindAllStringSubmatch(args[1].String(), -1)
		for _, v := range l {
			ls = append(ls, v...)
		}
	}
	l := []interface{}{}
	for _, v := range ls {
		l = append(l, v)
	}
	return js.ValueOf(l)
}
