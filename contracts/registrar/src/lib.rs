#![no_std]

#[cfg(test)]
extern crate std;

use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Bytes, BytesN,
    Env, Error, IntoVal, Symbol,
};

mod keys {
    pub const REGISTRY: &[u8] = b"REG_ADDR";
    pub const TLD: &[u8] = b"REG_TLD";
    pub const PARAMS: &[u8] = b"REG_PARM";
    pub const ADMIN: &[u8] = b"REG_ADMN";
    pub const COMM: &[u8] = b"REG_COMM";
}

fn default_params() -> RegistrarParams {
    RegistrarParams {
        min_label_len: 1,
        max_label_len: 63,
        commit_min_age_secs: 60,
        commit_max_age_secs: 86_400,
        renew_extension_secs: 31_536_000,
        grace_period_secs: 7_776_000,
    }
}

fn singleton_key(env: &Env, tag: &[u8]) -> Bytes {
    Bytes::from_slice(env, tag)
}

fn commitment_key(env: &Env, commitment: &BytesN<32>) -> Bytes {
    let mut key = Bytes::from_slice(env, keys::COMM);
    key.extend_from_array(&commitment.to_array());
    key
}

fn read_registry(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_tld(env: &Env) -> Bytes {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::TLD);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_admin(env: &Env) -> Address {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::ADMIN);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn read_params(env: &Env) -> RegistrarParams {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::PARAMS);
    storage.get(&key).unwrap_or_else(|| {
        panic_with_error!(env, RegistrarError::NotInitialized);
    })
}

fn write_params(env: &Env, params: &RegistrarParams) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::PARAMS);
    storage.set(&key, params);
}

fn write_registry(env: &Env, registry: &Address) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    storage.set(&key, registry);
}

fn write_tld(env: &Env, tld: &Bytes) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::TLD);
    storage.set(&key, tld);
}

fn write_admin(env: &Env, admin: &Address) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::ADMIN);
    storage.set(&key, admin);
}

fn validate_label(env: &Env, label: &Bytes) {
    let params = read_params(env);
    let len = label.len();
    if len < params.min_label_len || len > params.max_label_len {
        panic_with_error!(env, RegistrarError::InvalidLabel);
    }
}

fn compute_commitment(env: &Env, label: &Bytes, owner: &Address, secret: &Bytes) -> BytesN<32> {
    let mut data = Bytes::new(env);
    data.append(label);
    let owner_bytes = owner.clone().to_xdr(env);
    data.append(&owner_bytes);
    data.append(secret);
    env.crypto().sha256(&data).to_bytes()
}

fn fold_hash(env: &Env, parent: &BytesN<32>, label_hash: &BytesN<32>) -> BytesN<32> {
    let mut data = Bytes::from_array(env, &parent.to_array());
    data.extend_from_array(&label_hash.to_array());
    env.crypto().sha256(&data).to_bytes()
}

fn compute_namehash(env: &Env, label: &Bytes) -> BytesN<32> {
    let tld = read_tld(env);
    let root = BytesN::<32>::from_array(env, &[0u8; 32]);
    let tld_hash = env.crypto().sha256(&tld).to_bytes();
    let node = fold_hash(env, &root, &tld_hash);
    let label_hash = env.crypto().sha256(label).to_bytes();
    fold_hash(env, &node, &label_hash)
}

fn commitment_timestamp(env: &Env, commitment: &BytesN<32>) -> Option<u64> {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.get(&key)
}

fn store_commitment(env: &Env, commitment: &BytesN<32>, ts: u64) {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.set(&key, &ts);
}

fn remove_commitment(env: &Env, commitment: &BytesN<32>) {
    let storage = env.storage().persistent();
    let key = commitment_key(env, commitment);
    storage.remove(&key);
}

fn ensure_initialized(env: &Env) {
    let storage = env.storage().persistent();
    let key = singleton_key(env, keys::REGISTRY);
    if !storage.has(&key) {
        panic_with_error!(env, RegistrarError::NotInitialized);
    }
}

fn ensure_admin(env: &Env, caller: &Address) {
    let admin = read_admin(env);
    if admin != *caller {
        panic_with_error!(env, RegistrarError::NotAdmin);
    }
}

fn grace_expired(now: u64, expires_at: u64, grace: u64) -> bool {
    if now <= expires_at {
        return false;
    }
    let grace_end = expires_at.checked_add(grace).unwrap_or(u64::MAX);
    now > grace_end
}

mod registry_api {
    use super::*;

    pub fn set_owner(env: &Env, registry: &Address, namehash: &BytesN<32>, owner: &Address) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "set_owner"),
            (namehash, owner).into_val(env),
        );
    }

    pub fn set_resolver(env: &Env, registry: &Address, namehash: &BytesN<32>, resolver: &Address) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "set_resolver"),
            (namehash, resolver).into_val(env),
        );
    }

    pub fn renew(env: &Env, registry: &Address, namehash: &BytesN<32>) {
        env.invoke_contract::<()>(
            &registry,
            &Symbol::new(env, "renew"),
            (namehash,).into_val(env),
        );
    }

    pub fn owner(env: &Env, registry: &Address, namehash: &BytesN<32>) -> Option<Address> {
        let args = (namehash.clone(),).into_val(env);
        match env.try_invoke_contract::<Address, Error>(&registry, &Symbol::new(env, "owner"), args)
        {
            Ok(Ok(address)) => Some(address),
            _ => None,
        }
    }

    pub fn expires(env: &Env, registry: &Address, namehash: &BytesN<32>) -> Option<u64> {
        let args = (namehash.clone(),).into_val(env);
        match env.try_invoke_contract::<u64, Error>(&registry, &Symbol::new(env, "expires"), args) {
            Ok(Ok(ts)) => Some(ts),
            _ => None,
        }
    }
}

/// Registrar contract for the `.stellar` namespace.
/// Provides commit–reveal registration, renewals, and availability checks.
/// Interacts with the Registry (and optionally Resolver) contracts.
#[contract]
pub struct Registrar;

#[contracttype]
#[derive(Clone)]
pub struct RegistrarParams {
    pub min_label_len: u32,
    pub max_label_len: u32,
    pub commit_min_age_secs: u64,
    pub commit_max_age_secs: u64,
    pub renew_extension_secs: u64,
    pub grace_period_secs: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RegistrarError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAdmin = 3,
    NotOwner = 4,
    InvalidLabel = 5,
    CommitmentExists = 6,
    CommitmentMissingOrStale = 7,
    NameNotAvailable = 8,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtCommitMade {
    pub commitment: BytesN<32>,
    pub at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtNameRegistered {
    pub namehash: BytesN<32>,
    pub owner: Address,
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct EvtNameRenewed {
    pub namehash: BytesN<32>,
    pub expires_at: u64,
}

#[contractimpl]
impl Registrar {
    /// One-time initializer.
    pub fn init(env: Env, registry: Address, tld: Bytes, admin: Address) {
        let storage = env.storage().persistent();
        let key = singleton_key(&env, keys::REGISTRY);
        if storage.has(&key) {
            panic_with_error!(&env, RegistrarError::AlreadyInitialized);
        }
        if tld.is_empty() {
            panic_with_error!(&env, RegistrarError::InvalidLabel);
        }
        write_registry(&env, &registry);
        write_tld(&env, &tld);
        write_admin(&env, &admin);
        let params = default_params();
        write_params(&env, &params);
    }

    /// Record commitment timestamp for commit–reveal.
    pub fn commit(env: Env, caller: Address, commitment: BytesN<32>) {
        ensure_initialized(&env);
        caller.require_auth();
        let key = commitment_key(&env, &commitment);
        let storage = env.storage().persistent();
        if storage.has(&key) {
            panic_with_error!(&env, RegistrarError::CommitmentExists);
        }
        let ts = env.ledger().timestamp();
        store_commitment(&env, &commitment, ts);
        env.events().publish(
            (Symbol::new(&env, "commit_made"), commitment.clone()),
            EvtCommitMade { commitment, at: ts },
        );
    }

    /// Finalize name registration after commitment matures.
    #[allow(clippy::too_many_arguments)]
    pub fn register(
        env: Env,
        caller: Address,
        label: Bytes,
        owner: Address,
        secret: Bytes,
        resolver: Option<Address>,
    ) -> BytesN<32> {
        ensure_initialized(&env);
        caller.require_auth();
        validate_label(&env, &label);

        let params = read_params(&env);
        let registry = read_registry(&env);
        let now = env.ledger().timestamp();
        let commitment = compute_commitment(&env, &label, &owner, &secret);

        let stored = commitment_timestamp(&env, &commitment)
            .unwrap_or_else(|| panic_with_error!(&env, RegistrarError::CommitmentMissingOrStale));
        let age = if now >= stored { now - stored } else { 0 };
        if age < params.commit_min_age_secs || age > params.commit_max_age_secs {
            panic_with_error!(&env, RegistrarError::CommitmentMissingOrStale);
        }
        remove_commitment(&env, &commitment);

        if !Self::available(env.clone(), label.clone()) {
            panic_with_error!(&env, RegistrarError::NameNotAvailable);
        }

        let namehash = compute_namehash(&env, &label);

        registry_api::set_owner(&env, &registry, &namehash, &owner);
        if let Some(resolver_addr) = resolver.as_ref() {
            registry_api::set_resolver(&env, &registry, &namehash, resolver_addr);
        }
        registry_api::renew(&env, &registry, &namehash);

        let expires_at = registry_api::expires(&env, &registry, &namehash).unwrap_or_else(|| {
            now.checked_add(params.renew_extension_secs)
                .unwrap_or(u64::MAX)
        });

        env.events().publish(
            (Symbol::new(&env, "name_registered"), namehash.clone()),
            EvtNameRegistered {
                namehash: namehash.clone(),
                owner: owner.clone(),
                expires_at,
            },
        );

        namehash
    }

    /// Extend an existing registration's expiry.
    pub fn renew(env: Env, caller: Address, label: Bytes) {
        ensure_initialized(&env);
        caller.require_auth();
        validate_label(&env, &label);

        let registry = read_registry(&env);
        let namehash = compute_namehash(&env, &label);
        let owner = registry_api::owner(&env, &registry, &namehash)
            .unwrap_or_else(|| panic_with_error!(&env, RegistrarError::NotOwner));
        if owner != caller {
            panic_with_error!(&env, RegistrarError::NotOwner);
        }

        registry_api::renew(&env, &registry, &namehash);
        let expires_at = registry_api::expires(&env, &registry, &namehash)
            .unwrap_or_else(|| panic_with_error!(&env, RegistrarError::NotInitialized));

        env.events().publish(
            (Symbol::new(&env, "name_renewed"), namehash.clone()),
            EvtNameRenewed {
                namehash,
                expires_at,
            },
        );
    }

    /// Return whether the label is currently available.
    pub fn available(env: Env, label: Bytes) -> bool {
        if label.is_empty() {
            return false;
        }
        if env
            .storage()
            .persistent()
            .has(&singleton_key(&env, keys::REGISTRY))
            == false
        {
            return false;
        }
        let params = read_params(&env);
        if label.len() < params.min_label_len || label.len() > params.max_label_len {
            return false;
        }
        let registry = read_registry(&env);
        let namehash = compute_namehash(&env, &label);

        let owner = registry_api::owner(&env, &registry, &namehash);
        if owner.is_none() {
            return true;
        }

        let expires_at = registry_api::expires(&env, &registry, &namehash);
        match expires_at {
            None => true,
            Some(ts) => {
                let now = env.ledger().timestamp();
                grace_expired(now, ts, params.grace_period_secs)
            }
        }
    }

    /// Update registrar parameters (admin only).
    pub fn set_params(env: Env, caller: Address, params: RegistrarParams) {
        ensure_initialized(&env);
        caller.require_auth();
        ensure_admin(&env, &caller);
        if params.min_label_len == 0
            || params.min_label_len > params.max_label_len
            || params.commit_min_age_secs == 0
            || params.commit_min_age_secs > params.commit_max_age_secs
        {
            panic_with_error!(&env, RegistrarError::InvalidLabel);
        }
        write_params(&env, &params);
    }

    /// Fetch current registrar parameters.
    pub fn params(env: Env) -> RegistrarParams {
        ensure_initialized(&env);
        read_params(&env)
    }

    /// Stored registry address helper.
    pub fn registry(env: Env) -> Address {
        ensure_initialized(&env);
        read_registry(&env)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{
        contract, contractimpl, contracttype,
        testutils::{Address as _, Events, Ledger},
        Address, Bytes, BytesN, Env, Symbol, TryFromVal,
    };
    use std::panic::{catch_unwind, AssertUnwindSafe};

    const MOCK_RENEW_EXTENSION: u64 = 31_536_000;

    #[contract]
    pub struct MockRegistry;

    #[contracttype]
    #[derive(Clone)]
    enum MockRegistryKey {
        Owner(BytesN<32>),
        Resolver(BytesN<32>),
        Expires(BytesN<32>),
    }

    #[contractimpl]
    impl MockRegistry {
        pub fn owner(env: Env, namehash: BytesN<32>) -> Address {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Owner(namehash.clone()))
                .unwrap_or_else(|| panic!("owner not set"))
        }

        pub fn set_owner(env: Env, namehash: BytesN<32>, owner: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Owner(namehash), &owner);
        }

        pub fn set_resolver(env: Env, namehash: BytesN<32>, resolver: Address) {
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Resolver(namehash), &resolver);
        }

        pub fn resolver(env: Env, namehash: BytesN<32>) -> Option<Address> {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Resolver(namehash))
        }

        pub fn renew(env: Env, namehash: BytesN<32>) {
            let now = env.ledger().timestamp();
            let current = env
                .storage()
                .persistent()
                .get(&MockRegistryKey::Expires(namehash.clone()))
                .unwrap_or(0u64);
            let base = if current > now { current } else { now };
            let new_expiry = base.checked_add(MOCK_RENEW_EXTENSION).unwrap_or(u64::MAX);
            env.storage()
                .persistent()
                .set(&MockRegistryKey::Expires(namehash), &new_expiry);
        }

        pub fn expires(env: Env, namehash: BytesN<32>) -> u64 {
            env.storage()
                .persistent()
                .get(&MockRegistryKey::Expires(namehash.clone()))
                .unwrap_or_else(|| panic!("expiry not set"))
        }
    }

    fn setup_env() -> (Env, Address, Address, Address) {
        let env = Env::default();
        let registry_id = env.register(MockRegistry, ());
        let registrar_id = env.register(Registrar, ());
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let admin = Address::generate(&env);
        let tld = Bytes::from_slice(&env, b"stellar");
        registrar_client.init(&registry_id, &tld, &admin);
        env.mock_all_auths();
        (env, registry_id, registrar_id, admin)
    }

    fn make_label(env: &Env, text: &str) -> Bytes {
        Bytes::from_slice(env, text.as_bytes())
    }

    fn make_bytes(env: &Env, data: &[u8]) -> Bytes {
        Bytes::from_slice(env, data)
    }

    fn make_commitment(env: &Env, label: &Bytes, owner: &Address, secret: &Bytes) -> BytesN<32> {
        super::compute_commitment(env, label, owner, secret)
    }

    fn expected_namehash(env: &Env, label: &Bytes) -> BytesN<32> {
        let tld = Bytes::from_slice(env, b"stellar");
        let root = BytesN::<32>::from_array(env, &[0u8; 32]);
        let tld_hash = env.crypto().sha256(&tld).to_bytes();
        let node = super::fold_hash(env, &root, &tld_hash);
        let label_hash = env.crypto().sha256(label).to_bytes();
        super::fold_hash(env, &node, &label_hash)
    }

    fn register_name(
        env: &Env,
        registry_client: &MockRegistryClient,
        registrar_client: &RegistrarClient,
        caller: &Address,
        label: &Bytes,
        owner: &Address,
        secret: &Bytes,
        resolver: Option<&Address>,
    ) -> BytesN<32> {
        let commitment = make_commitment(env, label, owner, secret);
        registrar_client.commit(caller, &commitment);
        let params = registrar_client.params();
        let now = env.ledger().timestamp();
        env.ledger().set_timestamp(now + params.commit_min_age_secs);
        let resolver_arg = resolver.cloned();
        let result = registrar_client.register(caller, label, owner, secret, &resolver_arg);
        let namehash = expected_namehash(env, label);
        assert_eq!(result, namehash);
        let stored_owner = registry_client.owner(&namehash);
        assert_eq!(stored_owner, *owner);
        namehash
    }

    #[test]
    fn init_only_once() {
        let (env, registry_id, registrar_id, admin) = setup_env();
        let registrar_client = RegistrarClient::new(&env, &registrar_id);
        let tld = Bytes::from_slice(&env, b"stellar");
        let second = catch_unwind(AssertUnwindSafe(|| {
            registrar_client.init(&registry_id, &tld, &admin);
        }));
        assert!(second.is_err());
    }
    }
}
