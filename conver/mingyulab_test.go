package conver

import (
	"encoding/json"
	"fmt"
	"testing"
)

func TestToMlab(t *testing.T) {
	ml, err := ToMlab([]byte(`{"version":"1","flower":[{"setName":"emblemOfSeveredFate","position":"flower","mainTag":{"name":"lifeStatic","value":4780.0},"normalTags":[{"name":"criticalDamage","value":0.20199999999999999},{"name":"defendStatic","value":58.0},{"name":"recharge","value":0.11}],"omit":false,"level":20,"star":5},{"setName":"tenacityOfTheMillelith","position":"flower","mainTag":{"name":"lifeStatic","value":4780.0},"normalTags":[{"name":"defendStatic","value":37.0},{"name":"recharge","value":0.10400000000000001},{"name":"critical","value":0.07400000000000001},{"name":"attackPercentage","value":0.152}],"omit":false,"level":20,"star":5},{"setName":"crimsonWitch","position":"flower","mainTag":{"name":"lifeStatic","value":4780.0},"normalTags":[{"name":"recharge","value":0.045},{"name":"defendStatic","value":56.0},{"name":"critical","value":0.14},{"name":"criticalDamage","value":0.054000000000000006}],"omit":false,"level":20,"star":5},{"setName":"emblemOfSeveredFate","position":"flower","mainTag":{"name":"lifeStatic","value":3967.0},"normalTags":[{"name":"criticalDamage","value":0.132},{"name":"critical","value":0.062},{"name":"defendStatic","value":16.0},{"name":"elementalMastery","value":51.0}],"omit":false,"level":16,"star":5},{"setName":"shimenawaReminiscence","position":"flower","mainTag":{"name":"lifeStatic","value":3967.0},"normalTags":[{"name":"elementalMastery","value":37.0},{"name":"critical","value":0.035},{"name":"lifePercentage","value":0.040999999999999995},{"name":"recharge","value":0.162}],"omit":false,"level":16,"star":5}]}`))
	if err != nil {
		t.Fatal(err)
	}
	b, _ := json.Marshal(ml)
	fmt.Println(string(b))
}
