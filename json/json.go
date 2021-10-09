package main

import (
	"strings"
	"time"

	"github.com/xxmdhs/ip/json2struct"

	"github.com/hexops/vecty"
	"github.com/hexops/vecty/elem"
	"github.com/hexops/vecty/event"
	"github.com/hexops/vecty/prop"
)

func main() {
	vecty.SetTitle("json2struct playground")
	vecty.AddStylesheet("https://cdn.jsdelivr.net/npm/skeleton-css@2.0.4/css/skeleton.min.css")
	vecty.AddStylesheet("app.css")
	p := &PageView{
		Input: `{
	"text": "Hello",
	"categories": [
		{"id": 1,"name": "Golang"}
	]
}`,
		StructName: "blog",
	}
	vecty.RenderBody(p)
	select {}
}

// PageView is our main page component.
type PageView struct {
	vecty.Core
	Input          string
	StructName     string
	Prefix         string
	Suffix         string
	UseShortStruct bool
	UseLocal       bool
	UseOmitempty   bool
	UseExampleTag  bool
	lastTimeKey    int64
}

// Render implements the vecty.Component interface.
func (p *PageView) Render() vecty.ComponentOrHTML {
	s := &StructObject{
		Input: p.Input,
		Option: json2struct.Options{
			Name:           p.StructName,
			Prefix:         p.Prefix,
			Suffix:         p.Suffix,
			UseShortStruct: p.UseShortStruct,
			UseLocal:       p.UseLocal,
			UseOmitempty:   p.UseOmitempty,
			UseExample:     p.UseExampleTag,
		},
	}
	return elem.Body(
		elem.Header(
			vecty.Markup(vecty.Class("header")),
			vecty.Text("json2struct playground"),
		),
		elem.Div(
			vecty.Markup(vecty.Class("wrapper")),
			elem.Div(
				vecty.Markup(vecty.Class("col"), vecty.Class("input")),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("input json"),
					),
					elem.TextArea(
						vecty.Markup(vecty.Class("u-full-width")),
						vecty.Text(p.Input),
						vecty.Markup(event.Input(func(e *vecty.Event) {
							p.Input = e.Target.Get("value").String()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("struct name"),
					),
					elem.Input(
						vecty.Markup(prop.Value(p.StructName)),
						vecty.Markup(prop.Type(prop.TypeText)),
						vecty.Markup(event.Input(func(e *vecty.Event) {
							p.StructName = e.Target.Get("value").String()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("struct prefix name"),
					),
					elem.Input(
						vecty.Markup(prop.Value(p.Prefix)),
						vecty.Markup(prop.Type(prop.TypeText)),
						vecty.Markup(event.Input(func(e *vecty.Event) {
							p.Prefix = e.Target.Get("value").String()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("struct suffix name"),
					),
					elem.Input(
						vecty.Markup(prop.Value(p.Suffix)),
						vecty.Markup(prop.Type(prop.TypeText)),
						vecty.Markup(event.Input(func(e *vecty.Event) {
							p.Suffix = e.Target.Get("value").String()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("omitempty mode"),
					),
					elem.Input(
						vecty.Markup(vecty.Class("toggle")),
						vecty.Markup(prop.Type(prop.TypeCheckbox)),
						vecty.Markup(prop.Checked(p.UseOmitempty)),
						vecty.Markup(event.Change(func(e *vecty.Event) {
							p.UseOmitempty = e.Target.Get("checked").Bool()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("short mode"),
					),
					elem.Input(
						vecty.Markup(vecty.Class("toggle")),
						vecty.Markup(prop.Type(prop.TypeCheckbox)),
						vecty.Markup(prop.Checked(p.UseShortStruct)),
						vecty.Markup(event.Change(func(e *vecty.Event) {
							p.UseShortStruct = e.Target.Get("checked").Bool()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("local mode"),
					),
					elem.Input(
						vecty.Markup(vecty.Class("toggle")),
						vecty.Markup(prop.Type(prop.TypeCheckbox)),
						vecty.Markup(prop.Checked(p.UseLocal)),
						vecty.Markup(event.Change(func(e *vecty.Event) {
							p.UseLocal = e.Target.Get("checked").Bool()
							p.rerender()
						})),
					),
				),
				elem.Div(
					vecty.Tag("label",
						vecty.Text("example tag mode"),
					),
					elem.Input(
						vecty.Markup(vecty.Class("toggle")),
						vecty.Markup(prop.Type(prop.TypeCheckbox)),
						vecty.Markup(prop.Checked(p.UseExampleTag),
							event.Change(func(e *vecty.Event) {
								p.UseExampleTag = e.Target.Get("checked").Bool()
								p.rerender()
							})),
					),
				),
			),
			elem.Div(
				vecty.Markup(vecty.Class("col"), vecty.Class("output")),
				vecty.Tag("label",
					vecty.Text("output struct"),
				),
				vecty.Tag("pre",
					elem.Code(
						s.Render(),
					),
				),
			),
		),
		elem.Footer(
			vecty.Markup(vecty.Class("footer")),
			vecty.Text("Used by "),
			elem.Anchor(
				vecty.Markup(prop.Href("https://github.com/yudppp/json2struct")),
				vecty.Text("yudppp/json2struct"),
			),
		),
	)

}

// rerender is rerender and debounce
func (p *PageView) rerender() {
	timeKey := time.Now().UnixNano()
	p.lastTimeKey = timeKey
	go func() {
		time.Sleep(800 * time.Millisecond)
		if timeKey == p.lastTimeKey {
			vecty.Rerender(p)
		}
	}()
}

var _ vecty.Component = &StructObject{}

// StructObject is output values.
type StructObject struct {
	vecty.Core
	Input  string
	Option json2struct.Options
}

// Render implements the vecty.Component interface.
func (m *StructObject) Render() vecty.ComponentOrHTML {
	output, err := json2struct.Parse(strings.NewReader(m.Input), m.Option)
	if err != nil {
		return elem.Div(
			vecty.Text("invalid"),
		)
	}
	return elem.Div(
		vecty.Text(output),
	)
}
