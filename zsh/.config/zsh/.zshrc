## General Options
# Reference: https://zsh.sourceforge.io/Doc/Release/Options.html
setopt autocd                
setopt extendedglob
setopt interactivecomments    
setopt correct

## History
setopt extendedhistory
setopt share_history          
setopt hist_verify            
setopt hist_expiredupsfirst
setopt hist_ignoredups
setopt hist_ignorespace
HISTSIZE=10000000
SAVEHIST=10000000
HISTFILE="$HOME/.cache/zsh/history"

## Load aliases
source "$HOME/.config/shell/alias"

# Load functions
fpath+=("$ZDOTDIR/functions")

## Source other ZSH config 
source $ZDOTDIR/prompt.zsh         
source $ZDOTDIR/bindkey.zsh        
source $ZDOTDIR/completion.zsh     
source $ZDOTDIR/plugins.zsh        
