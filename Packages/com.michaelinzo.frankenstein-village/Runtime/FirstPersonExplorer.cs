using Frankenstein.Core;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Frankenstein.Runtime
{
    /// <summary>
    /// Thin player controller on the Input System: WASD walk, mouse look, E interact, V cycle camera
    /// (first person, third person, top down). Which cameras are allowed is decided by Core through
    /// DlnkCameraModeBridge and InteractionRules, so top down disappears at Abyss. Escape frees the cursor.
    /// Code-complete, unverified in Unity (compile checked against original stubs only).
    /// </summary>
    public sealed class FirstPersonExplorer : MonoBehaviour
    {
        public CharacterController body;
        public Camera viewCamera;
        public DlnkCameraModeBridge cameraBridge;
        public HorrorAmbienceDirector director;
        public InteractionRaycaster interactor;
        [Tooltip("Shown only outside first person.")]
        public Renderer bodyRenderer;

        public float walkSpeed = 3.5f;
        public float lookDegreesPerPixel = 0.1f;
        public float eyeHeight = 1.6f;
        public float thirdPersonDistance = 3.5f;
        public float topDownHeight = 40f;
        public float gravity = 20f;

        private float _yaw;
        private float _pitch;
        private float _fall;
        private CameraMode _mode = CameraMode.FirstPerson;

        private void Start()
        {
            Cursor.lockState = CursorLockMode.Locked;
            if (cameraBridge != null)
            {
                cameraBridge.onModeChanged.AddListener(OnModeChanged);
                cameraBridge.Request(CameraMode.FirstPerson, CurrentDread());
            }
        }

        private float CurrentDread() { return director != null ? director.Sanity.Dread : 0f; }

        private void OnModeChanged(int mode) { _mode = DreadBuildingPolicy.CameraFromInt(mode); }

        private void Update()
        {
            var keys = Keyboard.current;
            var mouse = Mouse.current;
            if (keys == null || mouse == null) return;

            if (keys.escapeKey.wasPressedThisFrame) Cursor.lockState = CursorLockMode.None;
            else if (mouse.leftButton.wasPressedThisFrame) Cursor.lockState = CursorLockMode.Locked;

            if (Cursor.lockState == CursorLockMode.Locked)
            {
                Vector2 look = mouse.delta.ReadValue();
                _yaw += look.x * lookDegreesPerPixel;
                _pitch = Mathf.Clamp(_pitch - look.y * lookDegreesPerPixel, -80f, 80f);
            }
            transform.rotation = Quaternion.Euler(0f, _yaw, 0f);

            float forward = (keys.wKey.isPressed ? 1f : 0f) - (keys.sKey.isPressed ? 1f : 0f);
            float strafe = (keys.dKey.isPressed ? 1f : 0f) - (keys.aKey.isPressed ? 1f : 0f);
            _fall = body != null && body.isGrounded ? 0f : _fall - gravity * Time.deltaTime;
            Vector3 move = (transform.forward * forward + transform.right * strafe) * walkSpeed + new Vector3(0f, _fall, 0f);
            if (body != null) body.Move(move * Time.deltaTime);

            if (cameraBridge != null)
            {
                cameraBridge.OnDread(CurrentDread());
                if (keys.vKey.wasPressedThisFrame)
                    cameraBridge.Request(InteractionRules.NextCamera(cameraBridge.Current, CurrentDread()), CurrentDread());
            }
            if (keys.eKey.wasPressedThisFrame && interactor != null) interactor.TryInteract();
        }

        private void LateUpdate()
        {
            if (viewCamera == null) return;
            Vector3 head = transform.position + new Vector3(0f, eyeHeight, 0f);
            Quaternion look = Quaternion.Euler(_pitch, _yaw, 0f);
            if (bodyRenderer != null) bodyRenderer.enabled = _mode != CameraMode.FirstPerson;
            switch (_mode)
            {
                case CameraMode.ThirdPerson:
                    viewCamera.transform.SetPositionAndRotation(head - look * Vector3.forward * thirdPersonDistance, look);
                    break;
                case CameraMode.TopDown:
                    viewCamera.transform.SetPositionAndRotation(head + new Vector3(0f, topDownHeight, 0f), Quaternion.Euler(90f, _yaw, 0f));
                    break;
                default:
                    viewCamera.transform.SetPositionAndRotation(head, look);
                    break;
            }
            if (interactor != null && interactor.eye != null) interactor.eye.SetPositionAndRotation(head, look);
        }
    }
}
