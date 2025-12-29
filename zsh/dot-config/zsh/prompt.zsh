## Reference: https://stackoverflow.com/a/73590795
prompt_pwd () {
  local p=${${PWD:/~/\~}/#~\//\~/}
  psvar[1]="${(@j[/]M)${(@s[/]M)p##*/}##(.|)?}$p:t"
}

## Colors 
user='#94e2d5'
host='#89b4fa'
cwd='#f9e2af'

precmd_functions+=( prompt_pwd )
PS1="%F{$user}%n%f@%F{$host}%m%f %F{$cwd}%1v%f%(?..%F{red})%(!.#.>)%f "
