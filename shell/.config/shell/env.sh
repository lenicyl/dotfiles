### Environment variables for all shells

export XDG_CONFIG_HOME="$HOME/.config"
export XDG_DATA_HOME="$HOME/.local/share"
export XDG_CACHE_HOME="$HOME/.cache"

export CARGO_HOME="$HOME/.local/src/cargo"
export RUSTUP_HOME="$HOME/.local/src/rustup"
export PATH="$HOME/.local/bin:$CARGO_HOME/bin:$PATH"

export ANDROID_SDK_ROOT="$HOME/.local/dev/android"
export PATH="$ANDROID_SDK_ROOT/cmdline-tools/latest/bin:$PATH"

export FLUTTER_HOME="$HOME/.local/dev/flutter"
export PATH="$FLUTTER_HOME/bin:$PATH"

# Programs
export EDITOR="hx"
export BROWSER="firefox"

# I dont use X11 but sddm does
XCURSOR_SIZE=64
