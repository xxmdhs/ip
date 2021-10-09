package conver

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"reflect"
	"strconv"
)

type Mingyulab struct {
	AsKey         string  `json:"asKey"`
	Level         int     `json:"level"`
	MainStat      string  `json:"mainStat"`
	Mark          string  `json:"mark"`
	Rarity        int     `json:"rarity"`
	Slot          string  `json:"slot"`
	SubStat1Type  string  `json:"subStat1Type"`
	SubStat1Value float64 `json:"subStat1Value"`
	SubStat2Type  string  `json:"subStat2Type"`
	SubStat2Value float64 `json:"subStat2Value"`
	SubStat3Type  string  `json:"subStat3Type"`
	SubStat3Value float64 `json:"subStat3Value"`
	SubStat4Type  string  `json:"subStat4Type"`
	SubStat4Value float64 `json:"subStat4Value"`
}

var ErrNOSupport = errors.New("do not support version")

func ToMlab(b []byte) ([]Mingyulab, error) {
	m := mona{}
	err := json.Unmarshal(b, &m)
	if err != nil {
		return nil, fmt.Errorf("ToMlab: %w", err)
	}
	if m.Version != "1" {
		return nil, ErrNOSupport
	}

	ml := []Mingyulab{}

	typ := reflect.TypeOf(Mingyulab{})
	cache := make(map[string]int)
	for i := 0; i < typ.NumField(); i++ {
		cache[typ.Field(i).Name] = i
	}

	conver := func(m []monaInfo, ml *[]Mingyulab, SlotName string) {
		for _, v := range m {
			minfo := Mingyulab{
				AsKey:    setName[v.SetName],
				Level:    v.Level,
				MainStat: subStat[v.MainTag.Name],
				Mark:     "none",
				Rarity:   v.Star,
				Slot:     slot[SlotName],
			}
			rv := reflect.ValueOf(&minfo).Elem()
			for i, v := range v.NormalTags {
				i, v := i, v
				rv.Field(cache["SubStat"+strconv.Itoa(i+1)+"Type"]).SetString(subStat[v.Name])

				if v.Value < 1 {
					v.Value = v.Value * 100
					v.Value = math.Round(v.Value*100) / 100
				}

				rv.Field(cache["SubStat"+strconv.Itoa(i+1)+"Value"]).SetFloat(v.Value)
			}
			*ml = append(*ml, minfo)
		}
	}

	conver(m.Cup, &ml, "cup")
	conver(m.Feather, &ml, "feather")
	conver(m.Flower, &ml, "flower")
	conver(m.Head, &ml, "head")
	conver(m.Sand, &ml, "sand")
	return ml, nil
}
