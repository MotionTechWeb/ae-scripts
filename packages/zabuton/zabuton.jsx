/*
Name:ZabutonScript
data:2024/05/29
テキストの背景にピッタリの座布団を置くスクリプト
*/

(function main() {
  app.beginUndoGroup("Apply Pseudo Effect from FFX");

  var actComp = app.project.activeItem;

  if (actComp == null || !(actComp instanceof CompItem)) {
    alert("エラー: アクティブなコンポジションが選択されていません。");
    return;
  }

  if (actComp != null && actComp instanceof CompItem) {
    var baseShape = addShapeLayer(actComp);

    // .ffxファイルのパスを指定
    var scriptFile = new File($.fileName);
    var scriptDir = scriptFile.path;
    //エフェクトコントロール用のFFX読み込み
    var ffxFilePath = scriptDir + "/effectContlor_zabuton.ffx";
    // .ffxファイルを読み込んで適用
    applyFFX(baseShape, ffxFilePath);

    // デフォルト値を設定
    setDefaultValues(baseShape, "Zabuton");

    var textLayer = addTextLayer(actComp, "sourceText");

    setAnchorPointToCenter(textLayer);
    setShapeSizeExpression(baseShape, textLayer, "Zabuton");
    setShapeRoundnessExpression(baseShape, "Zabuton");
    setFillColor(baseShape, "Zabuton");

    app.endUndoGroup();
  }

  function addShapeLayer(comp) {
    return comp.layers.addShape();
  }

  function addTextLayer(comp, text) {
    return comp.layers.addText(text);
  }

  /*文字のアンカーポイントを中心に持ってくるエクスプレッション*/
  function setAnchorPointToCenter(layer) {
    var applyTextAnchorPointExpression =
      "[(thisLayer.sourceRectAtTime().width/2)+thisLayer.sourceRectAtTime().left," +
      "(thisLayer.sourceRectAtTime().height/2)+thisLayer.sourceRectAtTime().top]";
    layer
      .property("ADBE Transform Group")
      .property("ADBE Anchor Point").expression =
      applyTextAnchorPointExpression;
  }

  /*.ffxファイルを読み込んで適用*/
  function applyFFX(layer, ffxPath) {
    var ffxFile = new File(ffxPath);
    if (ffxFile.exists) {
      layer.applyPreset(ffxFile);
    } else {
      alert("FFXファイルが見つかりません: " + ffxPath);
    }
  }

  function setDefaultValues(shape, effectName) {
    var yPadding = shape.effect(effectName)("Y_position_Padding");
    yPadding.setValue(0); // ここでデフォルト値を設定
  }

  /*シェイプへのエクスプレッションの設定（サイズ）*/
  function setShapeSizeExpression(shape, textLayer, effectName) {
    var applyShapeSizeExpression =
      "X_slider = effect('" +
      effectName +
      "')('X_position_Padding'); \n" +
      "Y_slider = effect('" +
      effectName +
      "')('Y_position_Padding'); \n" +
      "x = thisComp.layer('" +
      textLayer.name +
      "').sourceRectAtTime().width + X_slider;\n" +
      "y = thisComp.layer('" +
      textLayer.name +
      "').sourceRectAtTime().height + Y_slider;\n" +
      "[x, y];\n";
    shape
      .property("ADBE Root Vectors Group")
      .addProperty("ADBE Vector Shape - Rect")
      .property("ADBE Vector Rect Size").expression = applyShapeSizeExpression;
  }

  /*シェイプへのエクスプレッションの設定（角丸）*/
  function setShapeRoundnessExpression(shape, effectName) {
    var roundnessProperty = shape
      .property("ADBE Root Vectors Group")
      .property("ADBE Vector Shape - Rect")
      .property("ADBE Vector Rect Roundness");
    var applyShapeRoundnessExpression =
      "effect('" + effectName + "')('zabuton_radius');";
    roundnessProperty.expression = applyShapeRoundnessExpression;
  }
  /*シェイプへのエクスプレッションの設定（塗り）*/
  function setFillColor(shape, effectName) {
    var colorProperty = shape
      .property("ADBE Root Vectors Group")
      .addProperty("ADBE Vector Graphic - Fill")
      .property("ADBE Vector Fill Color");
    var applyShapeColorExpression = "effect('" + effectName + "')('BG_Color');";
    colorProperty.expression = applyShapeColorExpression;
  }
})();
