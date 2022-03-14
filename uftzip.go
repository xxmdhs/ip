package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"io"
	"syscall/js"

	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"
)

func gbk2UtfZipJs(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		panic("len(args) < 1")
	}
	buffer := make([]byte, args[0].Length())
	js.CopyBytesToGo(buffer, args[0])
	b, err := gbk2UtfZip(buffer)
	if err != nil {
		return js.ValueOf(map[string]interface{}{"err": err.Error()})
	}
	var uint8Array = js.Global().Get("Uint8Array")
	dst := uint8Array.New(len(b))
	js.CopyBytesToJS(dst, b)
	return dst
}

func gbk2UtfZip(b []byte) ([]byte, error) {
	zipReader, err := zip.NewReader(bytes.NewReader(b), int64(len(b)))
	if err != nil {
		return nil, fmt.Errorf("gbk2UtfZip: %w", err)
	}
	rb := bytes.NewBuffer(nil)
	zipWriter := zip.NewWriter(rb)
	defer zipWriter.Close()
	for _, f := range zipReader.File {
		if !f.NonUTF8 {
			zipWriter.Copy(f)
			continue
		}
		s, err := gbkToUtf8([]byte(f.Name))
		if err != nil {
			return nil, fmt.Errorf("gbk2UtfZip: %w", err)
		}
		f.Name = string(s)
		f.NonUTF8 = false
		f.Flags = f.Flags | 2048
		fmt.Println(f.Flags)
		zipWriter.Copy(f)
	}
	zipWriter.Close()
	return rb.Bytes(), nil
}

func gbkToUtf8(s []byte) ([]byte, error) {
	reader := transform.NewReader(bytes.NewReader(s), simplifiedchinese.GBK.NewDecoder())
	d, e := io.ReadAll(reader)
	if e != nil {
		return nil, fmt.Errorf("gbkToUtf8: %w", e)
	}
	return d, nil
}
