package main

import (
	"strconv"

	"github.com/frustra/bbcode"
)

func ubb2html(ubb string) string {
	return c.Compile(ubb)
}

var c bbcode.Compiler

func init() {
	c = bbcode.NewCompiler(true, true)
	c.SetTag("tr", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "tr"
		return out, true
	})
	c.SetTag("td", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "td"
		return out, true
	})
	c.SetTag("align", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "dlv"
		out.Attrs["align"] = node.GetOpeningTag().Value
		return out, true
	})
	c.SetTag("font", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "span"
		out.Attrs["style"] = "font-family: " + node.GetOpeningTag().Value
		return out, true
	})
	c.SetTag("table", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "table"
		out.Attrs["border"] = "1"
		return out, true
	})
	c.SetTag("img", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		in := bbcode.NewHTMLTag("")
		in.Name = "img"
		in.Attrs["src"] = bbcode.ValidURL(bbcode.CompileText(node))
		in.Attrs["referrerpolicy"] = "no-referrer"
		return in, false
	})
	c.SetTag("url", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "a"
		value := node.GetOpeningTag().Value
		if value == "" {
			text := bbcode.CompileText(node)
			if len(text) > 0 {
				out.Attrs["href"] = bbcode.ValidURL(text)
				out.Attrs["rel"] = "nofollow noopener noreferrer"
			}
		} else {
			out.Attrs["href"] = bbcode.ValidURL(value)
			out.Attrs["rel"] = "nofollow noopener noreferrer"
		}
		out.Attrs["target"] = "_blank"
		return out, true
	})
	c.SetTag("quote", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "blockquote"
		return out, true
	})
	c.SetTag("size", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "span"
		if size, err := strconv.Atoi(node.GetOpeningTag().Value); err == nil {
			out.Attrs["style"] = "font-size: " + switchSize(size)
		} else {
			out.Attrs["style"] = "font-size: " + node.GetOpeningTag().Value
		}
		return out, true
	})
	c.SetTag("backcolor", func(node *bbcode.BBCodeNode) (*bbcode.HTMLTag, bool) {
		out := bbcode.NewHTMLTag("")
		out.Name = "span"
		out.Attrs["style"] = "background-color:" + node.GetOpeningTag().Value
		return out, true
	})
}

func switchSize(size int) string {
	//xx-small, x-small, small, medium, large, x-large, xx-large
	switch size {
	case 1:
		return "xx-small"
	case 2:
		return "x-small"
	case 3:
		return "small"
	case 4:
		return "medium"
	case 5:
		return "large"
	case 6:
		return "x-large"
	case 7:
		return "xx-large"
	default:
		return ""
	}
}
