// UNVERIFIED: written without access to the Unity editor, so it has not been compiled or run in Unity.
// It only calls Core APIs (VillageLayoutGenerator, VillageReport, CampaignGenerator, SanityModel, DreadThresholds)
// whose behavior is covered by dotnet property tests and JS golden parity.
using Frankenstein.Core;
using Frankenstein.Runtime;
using UnityEditor;
using UnityEngine;

namespace Frankenstein.Editor
{
    /// <summary>
    /// Read-only preview of Core output: village report for a seed, sanity and dread tier, and the seeded campaign.
    /// Use a VillageCatalogAsset for the layout; nothing here touches scenes or assets.
    /// </summary>
    public sealed class VillageCoreInspectorWindow : EditorWindow
    {
        private VillageCatalogAsset _catalogAsset;
        private int _seed = 1818;
        private float _sanity = 100f;
        private int _width = 16;
        private int _depth = 16;
        private int _targetCount = 30;
        private int _nights = CampaignGenerator.DefaultNights;
        private Vector2 _scroll;
        private string _reportText = "";
        private string _campaignText = "";
        private string _status = "Press Refresh to preview.";

        [MenuItem("Tools/Frankenstein/Village Core Inspector")]
        public static void Open()
        {
            GetWindow<VillageCoreInspectorWindow>("Village Core Inspector");
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Previews Core output only. Not verified in Unity.", EditorStyles.miniLabel);
            _catalogAsset = (VillageCatalogAsset)EditorGUILayout.ObjectField("Catalog", _catalogAsset, typeof(VillageCatalogAsset), false);
            _seed = EditorGUILayout.IntField("Seed", _seed);
            _sanity = EditorGUILayout.Slider("Sanity", _sanity, 0f, SanityModel.Max);
            _width = Mathf.Clamp(EditorGUILayout.IntField("Grid width", _width), 1, 64);
            _depth = Mathf.Clamp(EditorGUILayout.IntField("Grid depth", _depth), 1, 64);
            _targetCount = Mathf.Clamp(EditorGUILayout.IntField("Target pieces", _targetCount), 1, 400);
            _nights = Mathf.Clamp(EditorGUILayout.IntField("Campaign nights", _nights), CampaignGenerator.MinNights, CampaignGenerator.MaxNights);

            float dread = SanityModel.DreadFor(_sanity);
            EditorGUILayout.LabelField("Dread", Mathf.RoundToInt(dread * 100f) + "% (" + DreadThresholds.TierNames[DreadThresholds.TierFor(dread)] + ")");

            if (GUILayout.Button("Refresh")) Refresh(dread);
            EditorGUILayout.HelpBox(_status, MessageType.None);

            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            EditorGUILayout.LabelField("Village report", EditorStyles.boldLabel);
            EditorGUILayout.SelectableLabel(_reportText, EditorStyles.textArea, GUILayout.MinHeight(180));
            EditorGUILayout.LabelField("Campaign", EditorStyles.boldLabel);
            EditorGUILayout.SelectableLabel(_campaignText, EditorStyles.textArea, GUILayout.MinHeight(180));
            EditorGUILayout.EndScrollView();
        }

        private void Refresh(float dread)
        {
            var camp = CampaignGenerator.Generate(_seed, _nights);
            var sb = new System.Text.StringBuilder();
            sb.Append(camp.VillageName).Append('\n');
            foreach (var n in camp.Nights)
                sb.Append(n.Number).Append(". ").Append(n.Title).Append(" | dread ").Append(n.DreadTargetPercent)
                  .Append("% | ").Append(n.Sky).Append(", ").Append(n.Weather).Append('\n')
                  .Append("   ").Append(n.Rumor).Append('\n');
            _campaignText = sb.ToString();

            if (_catalogAsset == null)
            {
                _reportText = "";
                _status = "Assign a VillageCatalogAsset to preview the village report. Campaign preview needs no catalog.";
                return;
            }
            PrefabCatalog catalog = _catalogAsset.ToCatalog();
            var layout = VillageLayoutGenerator.Generate(catalog, _width, _depth, _targetCount, _seed);
            _reportText = VillageReport.Build(catalog, layout, _width, _depth, _seed, dread).ToMarkdown();
            _status = "Previewed " + layout.Count + " pieces for seed " + _seed + ".";
        }
    }
}
