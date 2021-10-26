package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"syscall/js"
)

func genKey() (pub, pr []byte, err error) {
	pub, pr, err = ed25519.GenerateKey(nil)
	if err != nil {
		return nil, nil, fmt.Errorf("genKey: %w", err)
	}
	return pub, pr, nil
}

func genKeyJs(this js.Value, args []js.Value) interface{} {
	pub, pr, err := genKey()
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	pubs := base64.StdEncoding.EncodeToString(pub)
	prs := base64.StdEncoding.EncodeToString(pr)
	return js.ValueOf([]interface{}{pubs, prs})
}

func sign(this js.Value, args []js.Value) interface{} {
	if len(args) != 2 {
		panic("sign: invalid arguments")
	}
	pr, err := base64.StdEncoding.DecodeString(args[0].String())
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	b := ed25519.Sign(pr, []byte(args[1].String()))
	return js.ValueOf(base64.StdEncoding.EncodeToString(b))
}

func verify(this js.Value, args []js.Value) interface{} {
	if len(args) != 3 {
		panic("verify: invalid arguments")
	}
	pub, err := base64.StdEncoding.DecodeString(args[0].String())
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	msg := []byte(args[1].String())
	sig, err := base64.StdEncoding.DecodeString(args[2].String())
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	return js.ValueOf(ed25519.Verify(pub, msg, sig))
}
