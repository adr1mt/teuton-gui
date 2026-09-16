group "Local" do
  target "Existe el fichero del alumno"
  run "test -f /tmp/#{get(:tt_members)}.flag && echo si || echo no"
  expect "si"

  target "Echo"
  run "echo hola"
  expect "hola"
end

play do
  show
  export
end
