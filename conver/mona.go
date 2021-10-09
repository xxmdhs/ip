package conver

type mona struct {
	Cup     []monaInfo `json:"cup"`
	Feather []monaInfo `json:"feather"`
	Flower  []monaInfo `json:"flower"`
	Head    []monaInfo `json:"head"`
	Sand    []monaInfo `json:"sand"`
	Version string     `json:"version"`
}

type monaInfo struct {
	Level      int                `json:"level"`
	MainTag    monaCupMainTag     `json:"mainTag"`
	NormalTags []monaCupNormalTag `json:"normalTags"`
	Omit       bool               `json:"omit"`
	Position   string             `json:"position"`
	SetName    string             `json:"setName"`
	Star       int                `json:"star"`
}

type monaCupMainTag struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}

type monaCupNormalTag struct {
	Name  string  `json:"name"`
	Value float64 `json:"value"`
}
