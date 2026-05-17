[databases]
${DB_NAME} = host=127.0.0.1 port=5432 dbname=${DB_NAME}

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
unix_socket_dir = /var/run/postgresql

auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt

pool_mode = transaction
default_pool_size = 10
min_pool_size = 2
reserve_pool_size = 5
reserve_pool_timeout = 3
max_client_conn = 100
server_idle_timeout = 600
server_lifetime = 3600
query_timeout = 0
query_wait_timeout = 30

logfile = /var/log/postgresql/pgbouncer.log
pidfile = /var/run/postgresql/pgbouncer.pid

ignore_startup_parameters = extra_float_digits,search_path

admin_users = postgres
stats_users = postgres
