import os
import sys
import winreg
import json

def setup_docker_autostart():
    print("Configuring Docker Desktop and Pharmacy System automatic startup...")
    
    # 1. Update Docker settings-store.json
    appdata = os.environ.get('APPDATA', '')
    docker_settings_path = os.path.join(appdata, 'Docker', 'settings-store.json')
    if os.path.exists(docker_settings_path):
        try:
            with open(docker_settings_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            data['AutoStart'] = True
            data['AutoStartOption'] = True
            with open(docker_settings_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            print("[OK] Docker settings-store.json AutoStart set to True")
        except Exception as e:
            print(f"[WARN] Could not update Docker settings: {e}")

    # 2. Configure HKCU Run Registry Key with proper quotes
    docker_exe = r"C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if os.path.exists(docker_exe):
        quoted_exe = f'"{docker_exe}"'
        try:
            key = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE)
            winreg.SetValueEx(key, "Docker Desktop", 0, winreg.REG_SZ, quoted_exe)
            winreg.CloseKey(key)
            print(f"[OK] Registry HKCU Run set to: {quoted_exe}")
        except Exception as e:
            print(f"[WARN] Could not update Registry Run key: {e}")

    # 3. Create a Startup Folder Shortcut for Docker Desktop as fail-safe
    startup_dir = os.path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
    if os.path.exists(startup_dir) and os.path.exists(docker_exe):
        vbs_script = f'''
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "{startup_dir}\\Docker Desktop.lnk"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "{docker_exe}"
oLink.Description = "Docker Desktop"
oLink.Save
'''
        vbs_path = os.path.join(startup_dir, "temp_make_shortcut.vbs")
        with open(vbs_path, 'w', encoding='utf-8') as f:
            f.write(vbs_script)
        os.system(f'cscript //nologo "{vbs_path}"')
        if os.path.exists(vbs_path):
            os.remove(vbs_path)
        print(f"[OK] Startup folder shortcut created: {startup_dir}\\Docker Desktop.lnk")

if __name__ == '__main__':
    setup_docker_autostart()
