using Frankenstein.Core;
using UnityEngine;
using UnityEngine.Networking;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Optional AI narration over HTTP. POSTs {"location","dread"} and expects {"text"}.
    /// Never blocks a frame: Narrate returns the latest cached line (or empty) and refreshes in the
    /// background. Wrap in <see cref="SafeNarrationProvider"/> so empty or failed calls fall back offline.
    /// </summary>
    public sealed class HttpNarrationProvider : INarrationProvider
    {
        [System.Serializable] private sealed class Request { public string location; public float dread; }
        [System.Serializable] private sealed class Response { public string text; }

        private readonly string _url;
        private string _latest = string.Empty;
        private bool _inFlight;

        public HttpNarrationProvider(string url) { _url = url; }

        public string Narrate(string locationId, float dread)
        {
            if (!_inFlight && !string.IsNullOrEmpty(_url)) Refresh(locationId, dread);
            return _latest;
        }

        private void Refresh(string locationId, float dread)
        {
            _inFlight = true;
            var body = JsonUtility.ToJson(new Request { location = locationId, dread = dread });
            var req = new UnityWebRequest(_url, UnityWebRequest.kHttpVerbPOST)
            {
                uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(body)),
                downloadHandler = new DownloadHandlerBuffer(),
                timeout = 5,
            };
            req.SetRequestHeader("Content-Type", "application/json");
            req.SendWebRequest().completed += _ =>
            {
                try
                {
                    if (req.result == UnityWebRequest.Result.Success)
                    {
                        var text = JsonUtility.FromJson<Response>(req.downloadHandler.text)?.text;
                        if (!string.IsNullOrWhiteSpace(text)) _latest = text;
                    }
                }
                catch (System.Exception) { /* keep the previous line; Safe provider covers empty */ }
                finally { req.Dispose(); _inFlight = false; }
            };
        }
    }
}
